import { createServerFn } from "@tanstack/react-start";

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

export const importFromNotion = createServerFn({ method: "POST" }).handler(async () => {
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

  // Fetch all pages with pagination
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

  const today = new Date().toISOString().slice(0, 10);

  type LeadRow = {
    company: string;
    website: string | null;
    contact_name: string | null;
    title: string | null;
    phone: string | null;
    email: string | null;
    location: string | null;
    notes: string | null;
    called: boolean;
    email_sent: boolean;
    last_contact_date: string | null;
    last_call_result: string | null;
    deal_stage: string;
    next_follow_up: string | null;
    follow_up_source: string | null;
  };

  const rows: LeadRow[] = [];
  let skippedEmpty = 0;
  const stageCounts: Record<string, number> = {};

  for (const page of all) {
    const pr = page.properties;
    const company = plain(pr["Company Name"]);
    if (!company || company === "New Client") {
      skippedEmpty++;
      continue;
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
    const contacted = !!pr["Contacted"]?.checkbox;
    const followUpNeeded = !!pr["Follow-up Needed"]?.checkbox;
    const followUpDone = !!pr["Follow-up Done"]?.checkbox;
    const onboarded = !!pr["Onboarded"]?.checkbox;
    const demoBooked = pr["Demo Booked"]?.select?.name ?? null;
    const dealStatus = pr["Deal Status"]?.select?.name ?? null;
    const contactStatus = pr["Contact Status"]?.select?.name ?? null;
    const outreachMethod = pr["Outreach Method"]?.select?.name ?? null;
    const outreachDate = pr["Outreach Date"]?.date?.start ?? null;

    // Map deal stage
    let deal_stage = "new_lead";
    if (onboarded) deal_stage = "client";
    else if (demoBooked) deal_stage = "meeting_booked";
    else if (dealStatus && /lost|dead|not.?interested/i.test(dealStatus)) deal_stage = "lost";
    else if (dealStatus && /negotiat|propos/i.test(dealStatus)) deal_stage = "negotiation";
    else if (contacted || called) deal_stage = "contacted";

    const isPhoneOutreach = outreachMethod === "Phone" || called;

    rows.push({
      company,
      website,
      contact_name: firstName,
      title,
      phone,
      email,
      location: [city, state, country].filter(Boolean).join(", ") || null,
      notes,
      called: called || (contacted && isPhoneOutreach),
      email_sent: contacted && !isPhoneOutreach,
      last_contact_date: outreachDate,
      last_call_result: null,
      deal_stage,
      next_follow_up: followUpNeeded && !followUpDone ? today : null,
      follow_up_source: followUpNeeded && !followUpDone ? (contactStatus ?? "Notion") : null,
    });

    stageCounts[deal_stage] = (stageCounts[deal_stage] ?? 0) + 1;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Wipe existing data so re-imports stay consistent with Notion
  await supabaseAdmin.from("call_logs").delete().not("id", "is", null);
  await supabaseAdmin.from("leads").delete().not("id", "is", null);

  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabaseAdmin.from("leads").insert(slice);
    if (error) throw new Error(error.message);
    inserted += slice.length;
  }

  return {
    fetched: all.length,
    skippedEmpty,
    imported: inserted,
    stageCounts,
  };
});
