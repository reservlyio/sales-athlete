import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { STAGE_COLOR, STAGE_LABEL, todayISO } from "@/lib/crm";
import { importLeads } from "@/lib/import.functions";
import { useServerFn } from "@tanstack/react-start";
import { Search, Plus, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/leads/")({
  head: () => ({ meta: [{ title: "Leads — Sales Command Center" }] }),
  component: LeadsPage,
});

type Tab = "followups" | "new" | "all";
type Lead = {
  id: string;
  company: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  deal_stage: string;
  called: boolean;
  next_follow_up: string | null;
  created_at: string;
};

function LeadsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("followups");
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");

  const totalQ = useQuery({
    queryKey: ["leads-total"],
    queryFn: async () => {
      const { count } = await supabase.from("leads").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const listQ = useQuery({
    queryKey: ["leads-list", tab, limit, search],
    queryFn: async (): Promise<Lead[]> => {
      let q = supabase
        .from("leads")
        .select("id,company,contact_name,phone,email,location,deal_stage,called,next_follow_up,created_at");
      if (tab === "followups") {
        q = q
          .lte("next_follow_up", todayISO())
          .neq("deal_stage", "client")
          .neq("deal_stage", "lost")
          .order("next_follow_up", { ascending: true });
      } else if (tab === "new") {
        q = q.eq("deal_stage", "new_lead").order("created_at", { ascending: false });
      } else {
        q = q.order("created_at", { ascending: false });
      }
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`company.ilike.${s},contact_name.ilike.${s},phone.ilike.${s},email.ilike.${s}`);
      }
      const { data, error } = await q.limit(limit);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const runImport = useServerFn(importLeads);
  const importMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/leads-seed.json");
      const leads = await res.json();
      return runImport({ data: { leads } });
    },
    onSuccess: (r) => {
      toast.success(r.skipped ? "Leads already imported" : `Imported ${r.imported} leads`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const empty = (totalQ.data ?? 0) === 0;

  return (
    <AppShell>
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Leads</h1>
          <p className="text-xs text-muted-foreground stat-num">
            {totalQ.data ?? "…"} total in pipeline
          </p>
        </div>
        <div className="flex gap-2">
          {empty && (
            <button
              onClick={() => importMut.mutate()}
              disabled={importMut.isPending}
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              <Upload className="size-4" />
              {importMut.isPending ? "Importing…" : "Import from Notion"}
            </button>
          )}
          <Link
            to="/leads/new"
            className="inline-flex items-center gap-1 bg-card border border-border rounded-md px-3 py-2 text-sm font-semibold hover:border-primary"
          >
            <Plus className="size-4" /> Add
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 bg-card rounded-lg p-1 border border-border overflow-x-auto">
        {([
          { id: "followups", label: "Follow-ups today" },
          { id: "new", label: "New leads" },
          { id: "all", label: "All" },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + page size */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, phone, email…"
            className="w-full bg-card border border-border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        {tab !== "followups" && (
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="bg-card border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* List */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {listQ.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : (listQ.data ?? []).length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {empty
              ? "No leads yet. Import your Notion CRM above or add one manually."
              : "Nothing here."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(listQ.data ?? []).map((l) => (
              <li key={l.id}>
                <Link
                  to="/leads/$id"
                  params={{ id: l.id }}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{l.company}</span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STAGE_COLOR[l.deal_stage] || ""}`}
                      >
                        {STAGE_LABEL[l.deal_stage] ?? l.deal_stage}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate stat-num mt-0.5">
                      {[l.contact_name, l.phone, l.location].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
