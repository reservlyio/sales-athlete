import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
