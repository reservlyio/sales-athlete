import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const NOTION_TOKEN = "ntn_v727530353876aXOJsv2B7gNj5t7mQnYMpBga7b6WsS7I7";
const NOTION_DB_ID = "91c1b1a4527283f88f0501627cc3d26a";
const BASE = "https://api.notion.com/v1";

const headers = {
  "Authorization": `Bearer ${NOTION_TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

export type NotionLead = {
  id: string;
  pageUrl: string;
  company: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  called: boolean;
  email_sent: boolean;
  contact_status: string | null;
  demo_booked: boolean;
  deal_closed: boolean;
  follow_up_needed: boolean;
  follow_up_done: boolean;
  outreach_date: string | null;
  notes: string | null;
  outreach_method: string | null;
};

function parseLead(page: any): NotionLead {
  const p = page.properties;
  const get = (key: string) => p[key];

  const company = get("Company Name")?.title?.[0]?.plain_text?.trim() || "Unknown";
  const called = get("Called")?.checkbox ?? false;
  const contacted = get("Contacted")?.checkbox ?? false;
  const contact_status = get("Contact Status")?.select?.name ?? null;
  const demo_booked = get("Demo Booked")?.select?.name === "Booked";
  const deal_closed = get("Deal Status")?.select?.name === "Closed";
  const follow_up_needed = get("Follow-up Needed")?.checkbox ?? false;
  const follow_up_done = get("Follow-up Done")?.checkbox ?? false;
  const outreach_date = get("Outreach Date")?.date?.start ?? null;
  const notes = get("Notes")?.rich_text?.[0]?.plain_text?.trim() || null;
  const outreach_method = get("Outreach Method")?.select?.name ?? null;
  const city = get("City")?.rich_text?.[0]?.plain_text?.trim() || "";
  const state = get("State")?.rich_text?.[0]?.plain_text?.trim() || "";
  const location = [city, state].filter(Boolean).join(", ") || null;

  return {
    id: page.id,
    pageUrl: page.url,
    company,
    contact_name: get("First Name")?.rich_text?.[0]?.plain_text?.trim() || null,
    phone: get("Phone Number")?.phone_number ?? null,
    email: get("Email")?.rich_text?.[0]?.plain_text?.trim() || null,
    location,
    called,
    email_sent: contacted,
    contact_status,
    demo_booked,
    deal_closed,
    follow_up_needed,
    follow_up_done,
    outreach_date,
    notes,
    outreach_method,
  };
}

async function queryDB(filter: any, sorts: any[] = [], page_size = 50, start_cursor?: string): Promise<any> {
  const body: any = { filter, sorts, page_size };
  if (start_cursor) body.start_cursor = start_cursor;
  const res = await fetch(`${BASE}/databases/${NOTION_DB_ID}/query`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

export const fetchNotionLeads = createServerFn({ method: "GET" })
  .validator(z.object({ tab: z.string(), search: z.string().optional(), limit: z.number().optional() }))
  .handler(async ({ data }) => {
    const { tab, search = "", limit = 50 } = data;

    let filter: any = { and: [] };

    if (tab === "all") {
      filter.and.push({ property: "Called", checkbox: { equals: false } });
    } else if (tab === "called") {
      filter.and.push({ property: "Called", checkbox: { equals: true } });
    } else if (tab === "contacted") {
      filter.and.push({ property: "Contacted", checkbox: { equals: true } });
      filter.and.push({ property: "Called", checkbox: { equals: false } });
    } else if (tab === "meeting") {
      filter.and.push({ property: "Demo Booked", select: { equals: "Booked" } });
    }

    if (search.trim()) {
      filter.and.push({
        or: [
          { property: "Company Name", title: { contains: search } },
          { property: "First Name", rich_text: { contains: search } },
          { property: "Phone Number", phone_number: { contains: search } },
          { property: "Email", rich_text: { contains: search } },
        ]
      });
    }

    if (filter.and.length === 0) filter = undefined;

    const res = await queryDB(filter, [{ timestamp: "created_time", direction: "ascending" }], limit);
    return (res.results ?? []).map(parseLead) as NotionLead[];
  });

export const fetchNotionFollowUps = createServerFn({ method: "GET" })
  .validator(z.object({ today: z.string() }))
  .handler(async ({ data }) => {
    const { today } = data;
    const filter = {
      and: [
        { property: "Follow-up Needed", checkbox: { equals: true } },
        { property: "Follow-up Done", checkbox: { equals: false } },
        { property: "Outreach Date", date: { on_or_before: today } },
      ]
    };
    const res = await queryDB(filter, [{ property: "Outreach Date", direction: "ascending" }], 100);
    return (res.results ?? []).map(parseLead) as NotionLead[];
  });

export const fetchNotionAnalytics = createServerFn({ method: "GET" })
  .validator(z.object({ since: z.string() }))
  .handler(async ({ data }) => {
    const { since } = data;
    const filter = {
      and: [
        { property: "Called", checkbox: { equals: true } },
        { property: "Outreach Date", date: { on_or_after: since } },
      ]
    };
    const res = await queryDB(filter, [{ property: "Outreach Date", direction: "ascending" }], 200);
    return (res.results ?? []).map((p: any) => ({
      id: p.id,
      company: p.properties["Company Name"]?.title?.[0]?.plain_text || "",
      call_date: p.properties["Outreach Date"]?.date?.start ?? null,
      result: p.properties["Contact Status"]?.select?.name ?? "No Answer",
      notes: p.properties["Notes"]?.rich_text?.[0]?.plain_text ?? null,
      demo_booked: p.properties["Demo Booked"]?.select?.name === "Booked",
    }));
  });

export const markNotionLead = createServerFn({ method: "POST" })
  .validator(z.object({
    pageId: z.string(),
    called: z.boolean().optional(),
    emailSent: z.boolean().optional(),
  }))
  .handler(async ({ data }) => {
    const { pageId, called, emailSent } = data;
    const properties: any = {};
    if (called !== undefined) properties["Called"] = { checkbox: called };
    if (emailSent !== undefined) properties["Contacted"] = { checkbox: emailSent };

    const res = await fetch(`${BASE}/pages/${pageId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ properties }),
    });
    const d = await res.json();
    return { ok: d.id === pageId };
  });
