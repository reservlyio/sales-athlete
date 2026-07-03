import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateCoaching = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      objections: z.array(z.object({ label: z.string(), count: z.number() })),
      totalCalls: z.number(),
      transfers: z.number(),
      meetings: z.number(),
      voicemails: z.number(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    type Result = { summary: string; tips: string[]; error: string | null };
    if (data.objections.length === 0) return { summary: "", tips: [], error: null } satisfies Result;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { summary: "", tips: [], error: "AI analysis isn't configured (missing LOVABLE_API_KEY)." } satisfies Result;
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const top = data.objections[0];
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        prompt: `You are an elite cold-calling coach analyzing a rep's call data. Respond with ONLY a JSON object — no markdown, no explanation.

Call data:
- Total calls: ${data.totalCalls}
- Transferred to decision maker: ${data.transfers} (${data.totalCalls > 0 ? Math.round((data.transfers / data.totalCalls) * 100) : 0}%)
- Meetings booked: ${data.meetings}
- Voicemails left: ${data.voicemails}
- Top objection pattern: "${top.label}" occurred ${top.count} time${top.count === 1 ? "" : "s"}
- All objections: ${data.objections.map((o) => `${o.label} (${o.count}×)`).join(", ")}

Return this JSON:
{
  "summary": "2-3 sentence plain-English description of the call performance. Mention total calls, transfer rate, most frequent objection, and what the pattern reveals about this rep's current stage.",
  "tips": ["tip 1 — 1-2 sentences, specific and actionable", "tip 2", "tip 3"]
}`,
      });
      const json = text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      const parsed = z.object({ summary: z.string(), tips: z.array(z.string()).min(1).max(5) }).parse(JSON.parse(json));
      return { ...parsed, error: null } satisfies Result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) return { summary: "", tips: [], error: "AI rate limit — try again in a moment" } satisfies Result;
      if (msg.includes("402")) return { summary: "", tips: [], error: "AI credits exhausted" } satisfies Result;
      return { summary: "", tips: [], error: `AI coaching failed: ${msg.slice(0, 200)}` } satisfies Result;
    }
  });

export const analyzeObjections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entries: z.array(z.string()).max(500) }).parse(input),
  )
  .handler(async ({ data }) => {
    type Result = { objections: { label: string; count: number }[]; error: string | null };
    if (data.entries.length === 0) return { objections: [], error: null } satisfies Result;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { objections: [], error: "AI analysis isn't configured (missing LOVABLE_API_KEY)." } satisfies Result;
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const schema = z.object({
      objections: z.array(z.object({ label: z.string(), count: z.number() })).min(1).max(8),
    });
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        prompt: `You are a sales analytics assistant. Each line is one cold-call log entry. Group ALL ${data.entries.length} entries into outcome clusters sorted by count descending. You MUST return between 1 and 8 clusters — never an empty array.

Group by the dominant pattern in each entry. Use clear labels like: "No Answer", "Voicemail Left", "Gatekeeper Blocked", "DM Not Interested", "Meeting Booked", "Bad Timing", "Price Objection", "Wrong Contact", etc.

Call logs:
${data.entries.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Respond with ONLY valid JSON — no markdown, no explanation, no trailing commas:
{"objections":[{"label":"...","count":N}]}`,
      });
      const json = text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      const parsed = schema.parse(JSON.parse(json));
      return { ...parsed, error: null } satisfies Result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) return { objections: [], error: "AI rate limit — try again in a moment" } satisfies Result;
      if (msg.includes("402")) return { objections: [], error: "AI credits exhausted" } satisfies Result;
      console.error("analyzeObjections failed:", msg);
      return { objections: [], error: `AI analysis failed: ${msg.slice(0, 200)}` } satisfies Result;
    }
  });
