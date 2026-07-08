import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { fmtDate } from "@/lib/crm";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leads/archived")({
  head: () => ({ meta: [{ title: "Archived Leads" }] }),
  component: ArchivedLeads,
});

type ArchivedLead = {
  id: string;
  company: string;
  contact_name: string | null;
  phone: string | null;
  deleted_at: string;
};

function ArchivedLeads() {
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["leads-archived"],
    queryFn: async (): Promise<ArchivedLead[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select("id,company,contact_name,phone,deleted_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ArchivedLead[];
    },
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").update({ deleted_at: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead restored");
      qc.invalidateQueries({ queryKey: ["leads-archived"] });
      qc.invalidateQueries({ queryKey: ["leads-list"] });
      qc.invalidateQueries({ queryKey: ["leads-total"] });
      qc.invalidateQueries({ queryKey: ["leads-due-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <Link to="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-4" /> Leads
      </Link>

      <h1 className="text-2xl md:text-3xl font-bold mb-1">Archived</h1>
      <p className="text-xs text-muted-foreground mb-5">Deleted leads. Restore one to bring it back into All Leads.</p>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {listQ.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : (listQ.data ?? []).length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No archived leads.</div>
        ) : (
          <ul className="divide-y divide-border">
            {listQ.data!.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-4 md:px-3 md:py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{l.company}</div>
                  <div className="text-xs text-muted-foreground truncate stat-num mt-0.5">
                    {[l.contact_name, l.phone].filter(Boolean).join(" · ")}
                    {l.contact_name || l.phone ? " · " : ""}
                    Deleted {fmtDate(l.deleted_at.slice(0, 10))}
                  </div>
                </div>
                <button
                  onClick={() => restore.mutate(l.id)}
                  disabled={restore.isPending}
                  className="inline-flex items-center gap-1.5 shrink-0 bg-card border border-border rounded-md px-3 py-1.5 text-xs font-semibold hover:border-primary disabled:opacity-50"
                >
                  <RotateCcw className="size-3.5" /> Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
