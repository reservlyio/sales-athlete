import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const analyzeObjections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ notes: z.array(z.string()).max(500) }).parse(input),
  )
  .handler(async ({ data }) => {
    type Result = { objections: { label: string; count: number }[]; error: string | null };
    if (data.notes.length === 0) return { objections: [], error: null } satisfies Result;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { objections: [], error: "AI analysis isn't configured (missing LOVABLE_API_KEY)." } satisfies Result;
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    try {
      const { output } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        output: Output.object({
          schema: z.object({
            objections: z
              .array(z.object({ label: z.string(), count: z.number() }))
              .max(8),
          }),
        }),
        prompt: `You are a sales coach. Below are recent call notes from cold outreach. Identify the TOP recurring objections / reasons leads pushed back. Cluster similar wording into one label (e.g. "Already using competitor", "Too expensive", "Decision maker unavailable", "Not interested right now", "Bad timing"). Return up to 8, sorted by count descending. Count = how many distinct notes mention that objection.

Notes:
${data.notes.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
      });
      return { ...output, error: null } satisfies Result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) return { objections: [], error: "AI rate limit — try again in a moment" } satisfies Result;
      if (msg.includes("402")) return { objections: [], error: "AI credits exhausted" } satisfies Result;
      console.error("analyzeObjections failed:", msg);
      return { objections: [], error: `AI analysis failed: ${msg.slice(0, 200)}` } satisfies Result;
    }
  });
