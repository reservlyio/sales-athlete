import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DATABASE_ID = "91c1b1a4-5272-83f8-8f05-01627cc3d26a";
const GATEWAY = "https://connector-gateway.lovable.dev/notion/v1";

type NotionProp = {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  select?: { name: string } | null;
  checkbox?: boolean;
  date?: { start: string } | null;
  url?: string | null;
  phone_number?: string | null;
};

type NotionPage = { id: string; properties: Record<string, NotionProp> };

function plain(p?: NotionProp): string | null {
  if (!p) return null;
  if (p.type === "title") return (p.title ?? []).map((r) => r.plain_text).join("").trim() || null;
  if (p.type === "rich_text") return (p.rich_text ?? []).map((r) => r.plain_text).join("").trim() || null;
  return null;
}

export const importFromNotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const NOTION_API_KEY = process.env.NOTION_API_KEY;
    if (!LOVABLE_API_KEY || !NOTION_API_KEY) {
      throw new Error("Notion is not connected. Please reconnect the Notion integration.");
    }

    const headers = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": NOTION_API_KEY,
      "Content-Type": "application/json",
    };

    // Fetch all pages with pagination. No sorts -> preserve Notion's default order.
    const all: NotionPage[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 200; i++) {
      const body: Record<string, unknown> = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const res = await fetch(`${GATEWAY}/databases/${DATABASE_ID}/query`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Notion query failed [${res.status}]: ${text.slice(0, 300)}`);
      }
      const data = (await res.json()) as { results: NotionPage[]; has_more: boolean; next_cursor: string | null };
      all.push(...data.results);
      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }

    type LeadRow = {
      notion_page_id: string;
      company: string;
      website: string | null;
      contact_name: string | null;
      title: string | null;
      phone: string | null;
      email: string | null;
      location: string | null;
      notes: string | null;
      called: boolean;
      created_at: string;
    };

    const rows: LeadRow[] = [];
    let skippedEmpty = 0;

    // Base timestamp so each row gets a monotonically increasing created_at.
    // The leads list sorts by created_at ASC, so this preserves Notion order.
    const baseMs = Date.now() - all.length * 1000;

    all.forEach((page, idx) => {
      const pr = page.properties;
      const company = plain(pr["Company Name"]);
      if (!company || company === "New Client") {
        skippedEmpty++;
        return;
      }

      const firstName = plain(pr["First Name"]);
      const title = plain(pr["Title"]);
      const email = plain(pr["Email"]);
      const phone = pr["Phone Number"]?.phone_number ?? null;
      const website = pr["Website"]?.url ?? null;
      const city = plain(pr["City"]);
      const country = pr["Country"]?.select?.name ?? null;
      const state = plain(pr["State"]);
      const notes = plain(pr["Notes"]);
      const called = !!pr["Called"]?.checkbox;

      rows.push({
        notion_page_id: page.id,
        company,
        website,
        contact_name: firstName,
        title,
        phone,
        email,
        location: [city, state, country].filter(Boolean).join(", ") || null,
        notes,
        called,
        created_at: new Date(baseMs + idx * 1000).toISOString(),
      });
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Upsert by notion_page_id instead of wiping the table: leads that already
    // exist locally keep their CRM progress (deal_stage, next_follow_up, notes,
    // called, call_logs) — only their Notion-sourced contact fields get refreshed.
    const CHUNK = 500;
    const existingIds = new Set<string>();
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK).map((r) => r.notion_page_id);
      const { data, error } = await supabaseAdmin
        .from("leads")
        .select("notion_page_id")
        .in("notion_page_id", slice);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        if (r.notion_page_id) existingIds.add(r.notion_page_id);
      }
    }

    const toUpdate = rows.filter((r) => existingIds.has(r.notion_page_id));
    const candidates = rows.filter((r) => !existingIds.has(r.notion_page_id));

    // One-time migration safety net: leads imported before notion_page_id existed
    // have it as NULL, so they'd never match above and would be duplicated as
    // "new" on the first sync after this column was added. Claim them by exact
    // company-name match instead (only when unambiguous) so they get tagged and
    // refreshed in place rather than duplicated.
    const normCompany = (s: string) => s.trim().toLowerCase();
    const untaggedByCompany = new Map<string, string[]>();
    {
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabaseAdmin
          .from("leads")
          .select("id,company")
          .is("notion_page_id", null)
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        for (const l of data ?? []) {
          const key = normCompany(l.company);
          const list = untaggedByCompany.get(key) ?? [];
          list.push(l.id);
          untaggedByCompany.set(key, list);
        }
        if (!data || data.length < PAGE) break;
      }
    }

    const claimedLeadIds = new Set<string>();
    const toBackfill: { id: string; row: LeadRow }[] = [];
    const toInsert: LeadRow[] = [];
    for (const r of candidates) {
      const ids = (untaggedByCompany.get(normCompany(r.company)) ?? []).filter((id) => !claimedLeadIds.has(id));
      if (ids.length === 1) {
        claimedLeadIds.add(ids[0]);
        toBackfill.push({ id: ids[0], row: r });
      } else {
        toInsert.push(r);
      }
    }

    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const slice = toInsert.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from("leads").insert(slice);
      if (error) throw new Error(error.message);
      inserted += slice.length;
    }

    let updated = 0;
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      const slice = toUpdate.slice(i, i + CHUNK).map((r) => ({
        notion_page_id: r.notion_page_id,
        company: r.company,
        website: r.website,
        contact_name: r.contact_name,
        title: r.title,
        phone: r.phone,
        email: r.email,
        location: r.location,
      }));
      const { error } = await supabaseAdmin.from("leads").upsert(slice, { onConflict: "notion_page_id" });
      if (error) throw new Error(error.message);
      updated += slice.length;
    }

    for (let i = 0; i < toBackfill.length; i += CHUNK) {
      const slice = toBackfill.slice(i, i + CHUNK).map(({ id, row }) => ({
        id,
        notion_page_id: row.notion_page_id,
        company: row.company,
        website: row.website,
        contact_name: row.contact_name,
        title: row.title,
        phone: row.phone,
        email: row.email,
        location: row.location,
      }));
      const { error } = await supabaseAdmin.from("leads").upsert(slice);
      if (error) throw new Error(error.message);
      updated += slice.length;
    }

    return {
      fetched: all.length,
      skippedEmpty,
      imported: inserted,
      updated,
    };
  });
