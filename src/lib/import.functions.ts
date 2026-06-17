import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LeadSchema = z.object({
  company: z.string(),
  website: z.string().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  called: z.boolean(),
  deal_stage: z.string(),
});

export const importLeads = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ leads: z.array(LeadSchema) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Only import if table is empty
    const { count } = await supabaseAdmin
      .from("leads")
      .select("*", { count: "exact", head: true });
    if ((count ?? 0) > 0) return { imported: 0, skipped: true };

    const CHUNK = 500;
    let total = 0;
    for (let i = 0; i < data.leads.length; i += CHUNK) {
      const slice = data.leads.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from("leads").insert(slice);
      if (error) throw new Error(error.message);
      total += slice.length;
    }
    return { imported: total, skipped: false };
  });
