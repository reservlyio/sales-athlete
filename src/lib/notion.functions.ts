import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const NOTION_DB = "collection://4711b1a4-5272-822e-bec6-07174cfb95cf";
const NOTION_MCP = "https://mcp.notion.com/mcp";

async function callNotion(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      mcp_servers: [{ type: "url", url: NOTION_MCP, name: "notion" }],
      system: "You are a data assistant. Return ONLY valid JSON arrays or objects. No markdown, no explanation, no backticks.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const d = await res.json();
  const blocks = d.content ?? [];
  let out = "";
  for (const b of blocks) {
    if (b.type === "text") out += b.text;
    if (b.type === "mcp_tool_result") out += b.content?.[0]?.text ?? "";
  }
  return out.replace(/```json|```/g, "").trim();
}

export type NotionLead = {
  id: string;
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

export const fetchNotionLeads = createServerFn({ method: "GET" })
  .validator(z.object({ tab: z.string(), search: z.string().optional(), limit: z.number().optional() }))
  .handler(async ({ data }) => {
    const { tab, search = "", limit = 50 } = data;

    let whereClause = "";
    if (tab === "called") whereClause = 'WHERE "Called" = \'__YES__\'';
    else if (tab === "contacted") whereClause = 'WHERE "Contacted" = \'__YES__\' AND ("Called" != \'__YES__\' OR "Called" IS NULL)';
    else if (tab === "meeting") whereClause = 'WHERE "Demo Booked" = \'Booked\'';
    else if (tab === "all") whereClause = 'WHERE ("Called" != \'__YES__\' OR "Called" IS NULL)';

    if (search) {
      const s = search.replace(/'/g, "''");
      const searchClause = `("Company Name" LIKE '%${s}%' OR "First Name" LIKE '%${s}%' OR "Phone Number" LIKE '%${s}%' OR "Email" LIKE '%${s}%')`;
      whereClause = whereClause ? `${whereClause} AND ${searchClause}` : `WHERE ${searchClause}`;
    }

    const prompt = `Query the Notion data source ${NOTION_DB}.

Run this SQL:
SELECT url, "Company Name", "First Name", "Phone Number", "Email", "City", "State", "Called", "Contacted", "Contact Status", "Demo Booked", "Deal Status", "Follow-up Needed", "Follow-up Done", "date:Outreach Date:start", "Notes", "Outreach Method"
FROM "${NOTION_DB}"
${whereClause}
ORDER BY createdTime ASC
LIMIT ${limit}

Return a JSON array where each object has:
- id: the url field
- company: Company Name
- contact_name: First Name (null if empty)
- phone: Phone Number (null if empty)
- email: Email (null if empty)
- location: City + ", " + State (null if both empty)
- called: true if Called = "__YES__", else false
- email_sent: true if Contacted = "__YES__", else false
- contact_status: Contact Status value (null if empty)
- demo_booked: true if Demo Booked = "Booked", else false
- deal_closed: true if Deal Status = "Closed", else false
- follow_up_needed: true if Follow-up Needed = "__YES__", else false
- follow_up_done: true if Follow-up Done = "__YES__", else false
- outreach_date: date:Outreach Date:start (null if empty)
- notes: Notes (null if empty)
- outreach_method: Outreach Method (null if empty)`;

    const raw = await callNotion(prompt);
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0 || end < 0) return [] as NotionLead[];
    return JSON.parse(raw.slice(start, end + 1)) as NotionLead[];
  });

export const fetchNotionFollowUps = createServerFn({ method: "GET" })
  .validator(z.object({ today: z.string() }))
  .handler(async ({ data }) => {
    const { today } = data;
    const prompt = `Query the Notion data source ${NOTION_DB}.

Run this SQL:
SELECT url, "Company Name", "First Name", "Phone Number", "Email", "City", "State", "Called", "Contacted", "Contact Status", "Demo Booked", "Deal Status", "Follow-up Needed", "Follow-up Done", "date:Outreach Date:start", "Notes", "Outreach Method"
FROM "${NOTION_DB}"
WHERE "Follow-up Needed" = '__YES__' AND "Follow-up Done" != '__YES__' AND "date:Outreach Date:start" <= '${today}'
ORDER BY "date:Outreach Date:start" ASC
LIMIT 100

Return a JSON array with same fields as before:
id, company, contact_name, phone, email, location, called, email_sent, contact_status, demo_booked, deal_closed, follow_up_needed, follow_up_done, outreach_date, notes, outreach_method`;

    const raw = await callNotion(prompt);
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0 || end < 0) return [] as NotionLead[];
    return JSON.parse(raw.slice(start, end + 1)) as NotionLead[];
  });

export const fetchNotionAnalytics = createServerFn({ method: "GET" })
  .validator(z.object({ since: z.string() }))
  .handler(async ({ data }) => {
    const { since } = data;
    const prompt = `Query the Notion data source ${NOTION_DB}.

Run this SQL:
SELECT url, "Company Name", "Called", "Contact Status", "Demo Booked", "Outreach Method", "Notes", "date:Outreach Date:start"
FROM "${NOTION_DB}"
WHERE "Called" = '__YES__' AND "date:Outreach Date:start" >= '${since}'
ORDER BY "date:Outreach Date:start" ASC

Return a JSON array where each object has:
- id: url
- company: Company Name
- call_date: date:Outreach Date:start
- result: Contact Status (or "No Answer" if null)
- notes: Notes (null if empty)`;

    const raw = await callNotion(prompt);
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0 || end < 0) return [];
    return JSON.parse(raw.slice(start, end + 1));
  });

export const markNotionLead = createServerFn({ method: "POST" })
  .validator(z.object({ pageUrl: z.string(), called: z.boolean().optional(), emailSent: z.boolean().optional(), undo: z.boolean().optional() }))
  .handler(async ({ data }) => {
    const { pageUrl, called, emailSent, undo } = data;
    const updates: string[] = [];
    if (called !== undefined) updates.push(`"Called": ${called ? '"__YES__"' : '"__NO__"'}`);
    if (emailSent !== undefined) updates.push(`"Contacted": ${emailSent ? '"__YES__"' : '"__NO__"'}`);
    if (undo) updates.push('"Contact Status": null');

    const prompt = `Update the Notion page at URL ${pageUrl}. Set these properties: ${updates.join(", ")}. Confirm done with {"ok": true}`;
    const raw = await callNotion(prompt);
    return { ok: raw.includes("ok") || raw.includes("true") };
  });
