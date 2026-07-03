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
    }).parse(input),
  )
  .handler(async ({ data }) => {
    type Result = { coaching: string; error: string | null };
    if (data.objections.length === 0) return { coaching: "", error: null } satisfies Result;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { coaching: "", error: "AI analysis isn't configured (missing LOVABLE_API_KEY)." } satisfies Result;
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        prompt: `You are an elite cold-calling coach. Based on these call outcomes, write exactly 3 short, punchy, actionable coaching tips to improve results.

Stats: ${data.totalCalls} calls, ${data.transfers} transferred to DM, ${data.meetings} meetings booked.
Top objections: ${data.objections.map((o) => `${o.label} (${o.count}×)`).join(", ")}.

Rules:
- Each tip is 1-2 sentences, direct and specific
- Address the biggest pattern in the data
- No bullet symbols, no numbering, no markdown
- Separate tips with a blank line`,
      });
      return { coaching: text.trim(), error: null } satisfies Result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) return { coaching: "", error: "AI rate limit — try again in a moment" } satisfies Result;
      if (msg.includes("402")) return { coaching: "", error: "AI credits exhausted" } satisfies Result;
      return { coaching: "", error: `AI coaching failed: ${msg.slice(0, 200)}` } satisfies Result;
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
      objections: z.array(z.object({ label: z.string(), count: z.number() })).max(8),
    });
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        prompt: `You are a sales analytics assistant. Each line is one cold-call log entry in the format "Result | Objection Source | Notes". Cluster ALL entries into meaningful outcome categories. Examples: "Gatekeeper blocked", "Decision maker not interested", "Bad timing / try later", "No answer", "Voicemail left", "Meeting booked", "Price objection", "Already using competitor", "Wrong contact". Return up to 8 clusters sorted by count descending. ALWAYS return at least 1 cluster — even if notes are brief, group by result type. Count = number of entries in that cluster.

Call logs:
${data.entries.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Respond with ONLY a JSON object — no markdown, no explanation:
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
