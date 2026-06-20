import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const parseFollowUpDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ text: z.string().min(1), today: z.string() }).parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    try {
      const { output } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        output: Output.object({
          schema: z.object({
            found: z.boolean(),
            date: z.string().nullable(),
            snippet: z.string().nullable(),
          }),
        }),
        prompt: `Today is ${data.today}. Read this sales note and extract a follow-up date if mentioned. Return ISO date (YYYY-MM-DD) only. If "next Tuesday" or "in 2 weeks" etc., compute the actual date. If no date is mentioned, set found=false.

Note: """${data.text}"""

Rules:
- "next Monday" = the upcoming Monday (not today's Monday)
- "in 2 weeks" = today + 14 days
- "tomorrow" = today + 1
- snippet = the exact words in the note that signaled the date`,
      });
      return output;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) throw new Error("AI rate limit — try again in a moment");
      if (msg.includes("402")) throw new Error("AI credits exhausted — add credits in workspace billing");
      return { found: false, date: null, snippet: null };
    }
  });
