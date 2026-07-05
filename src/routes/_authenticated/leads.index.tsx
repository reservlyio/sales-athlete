import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { STAGE_COLOR, STAGE_LABEL, todayISO, fmtDate } from "@/lib/crm";
import { importFromNotion } from "@/lib/notion-import.functions";
import { analyzeObjections, generateCoaching } from "@/lib/analytics.functions";
import { useServerFn } from "@tanstack/react-start";
import { Search, Plus, Upload, Phone, Mail, CalendarClock, Sparkles, BarChart3 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads/")({
  head: () => ({ meta: [{ title: "Leads — Sales Command Center" }] }),
  component: LeadsPage,
});

type Tab = "all" | "followups" | "called" | "contacted" | "meeting" | "analytics";
type Range = "day" | "week" | "month";

type Lead = {
  id: string;
  company: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  deal_stage: string;
  called: boolean;
  email_sent: boolean;
  next_follow_up: string | null;
  created_at: string;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All Leads" },
  { id: "followups", label: "Follow Ups" },
  { id: "called", label: "Called" },
  { id: "contacted", label: "Contacted" },
  { id: "meeting", label: "Meeting Booked" },
  { id: "analytics", label: "Analytics" },
];

function LeadsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("all");
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");

  const totalQ = useQuery({
    queryKey: ["leads-total"],
    queryFn: async () => {
      const { count } = await supabase.from("leads").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const dueCountQ = useQuery({
    queryKey: ["leads-due-count"],
    queryFn: async () => {
      const t = todayISO();
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .lte("next_follow_up", t)
        .neq("deal_stage", "lost")
        .neq("deal_stage", "client");
      return count ?? 0;
    },
  });

  const today = todayISO();

  const listQ = useQuery({
    queryKey: ["leads-list", tab, limit, search],
    enabled: tab !== "analytics",
    queryFn: async (): Promise<Lead[]> => {
      const cols =
        "id,company,contact_name,phone,email,location,deal_stage,called,email_sent,next_follow_up,created_at";

      if (tab === "all") {
        const base = supabase
          .from("leads")
          .select(cols)
          .eq("called", false)
          .neq("deal_stage", "lost")
          .neq("deal_stage", "client")
          .order("created_at", { ascending: true });
        const followups = supabase
          .from("leads")
          .select(cols)
          .lte("next_follow_up", today)
          .neq("deal_stage", "client")
          .neq("deal_stage", "lost")
          .order("next_follow_up", { ascending: true });

        let bq = base.limit(limit);
        let fq = followups.limit(100);
        if (search.trim()) {
          const s = `%${search.trim()}%`;
          bq = bq.or(`company.ilike.${s},contact_name.ilike.${s},phone.ilike.${s},email.ilike.${s}`);
          fq = fq.or(`company.ilike.${s},contact_name.ilike.${s},phone.ilike.${s},email.ilike.${s}`);
        }
        const [b, f] = await Promise.all([bq, fq]);
        if (b.error) throw b.error;
        if (f.error) throw f.error;
        const seen = new Set<string>();
        const merged: Lead[] = [];
        for (const l of (f.data ?? []) as Lead[]) {
          if (!seen.has(l.id)) { seen.add(l.id); merged.push(l); }
        }
        for (const l of (b.data ?? []) as Lead[]) {
          if (!seen.has(l.id)) { seen.add(l.id); merged.push(l); }
        }
        return merged;
      }

      let q = supabase.from("leads").select(cols);
      if (tab === "followups") {
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + 7);
        const horizonISO = `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, "0")}-${String(horizon.getDate()).padStart(2, "0")}`;
        q = q
          .not("next_follow_up", "is", null)
          .lte("next_follow_up", horizonISO)
          .neq("deal_stage", "lost")
          .neq("deal_stage", "client")
          .order("next_follow_up", { ascending: true });
      } else if (tab === "called") {
        q = q.eq("called", true).order("created_at", { ascending: true });
      } else if (tab === "contacted") {
        q = q.eq("email_sent", true).eq("called", false).order("created_at", { ascending: true });
      } else if (tab === "meeting") {
        q = q.eq("deal_stage", "meeting_booked").order("created_at", { ascending: true });
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

  const runImport = useServerFn(importFromNotion);
  const importMut = useMutation({
    mutationFn: async () => runImport(),
    onSuccess: (r) => {
      toast.success(`Imported ${r.imported} leads from Notion`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const quickToggle = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Lead> }) => {
      const { error } = await supabase.from("leads").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads-list"] });
      qc.invalidateQueries({ queryKey: ["leads-total"] });
      qc.invalidateQueries({ queryKey: ["leads-due-count"] });
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
          <button
            onClick={() => importMut.mutate()}
            disabled={importMut.isPending}
            title="Re-sync all leads from Notion (replaces current list)"
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            <Upload className="size-4" />
            {importMut.isPending ? "Syncing…" : empty ? "Import from Notion" : "Re-sync Notion"}
          </button>
          <Link
            to="/leads/new"
            className="inline-flex items-center gap-1 bg-card border border-border rounded-md px-3 py-2 text-sm font-semibold hover:border-primary"
          >
            <Plus className="size-4" /> Add
          </Link>
        </div>
      </header>

      <div className="flex gap-0.5 mb-10 md:mb-4 bg-muted rounded-full px-2 py-1.5 md:py-1 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`md:flex-1 whitespace-nowrap px-5 py-2 md:py-1.5 rounded-full text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10"
            }`}
          >
            {t.id === "analytics" ? (
              <span className="inline-flex items-center gap-1"><BarChart3 className="size-3.5" /> {t.label}</span>
            ) : t.id === "followups" ? (
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                {(dueCountQ.data ?? 0) > 0 && (
                  <span className={`text-[10px] stat-num font-bold rounded-full px-1.5 py-0.5 ${tab === t.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-destructive/20 text-destructive"}`}>
                    {dueCountQ.data}
                  </span>
                )}
              </span>
            ) : (
              t.label
            )}
          </button>
        ))}
      </div>

      {tab === "analytics" ? (
        <AnalyticsView />
      ) : (
        <>
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
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="bg-card border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {listQ.isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            ) : (listQ.data ?? []).length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {empty ? "No leads yet. Import your Notion CRM above or add one manually." : "Nothing here."}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {(listQ.data ?? []).map((l) => {
                  const fu = l.next_follow_up;
                  let fuBadge: { color: string; label: string } | null = null;
                  if (fu) {
                    if (fu < today) fuBadge = { color: "bg-destructive/20 text-destructive", label: `Overdue · ${fmtDate(fu)}` };
                    else if (fu === today) fuBadge = { color: "bg-warning/25 text-warning", label: "Due today" };
                    else fuBadge = { color: "bg-primary/15 text-primary", label: `Follow up ${fmtDate(fu)}` };
                  }
                  const showFuBadge = fuBadge && (tab === "all" || tab === "followups");
                  return (
                    <li key={l.id}>
                      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/30">
                        <Link to="/leads/$id" params={{ id: l.id }} className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{l.company}</span>
                            {(() => {
                              const effectiveStage =
                                l.deal_stage === "contacted" && !l.email_sent
                                  ? (l.called ? "called_only" : "new_lead")
                                  : l.deal_stage;
                              const label = effectiveStage === "called_only" ? "Called" : (STAGE_LABEL[effectiveStage] ?? effectiveStage);
                              const color = effectiveStage === "called_only" ? "bg-accent text-accent-foreground" : (STAGE_COLOR[effectiveStage] || "");
                              return (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${color}`}>{label}</span>
                              );
                            })()}
                            {showFuBadge && fuBadge && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${fuBadge.color}`}>
                                <CalendarClock className="size-3" /> {fuBadge.label}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate stat-num mt-0.5">
                            {[l.contact_name, l.phone, l.location].filter(Boolean).join(" · ")}
                          </div>
                        </Link>
                        <div className="flex flex-col md:flex-row gap-4 md:gap-2 shrink-0">
                          <button
                            onClick={(e) => { e.preventDefault(); nav({ to: "/leads/$id", params: { id: l.id }, search: { logCall: "1" } }); }}
                            title="Go to lead and log a call"
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 md:px-4 md:py-2 rounded-full border transition-all select-none ${
                              l.called ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" : "bg-muted/50 border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span className={`size-2 rounded-full shrink-0 ${l.called ? "bg-emerald-500" : "bg-muted-foreground/40"}`} /> Called
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              quickToggle.mutate({
                                id: l.id,
                                patch: {
                                  email_sent: !l.email_sent,
                                  deal_stage: !l.email_sent && l.deal_stage === "new_lead" ? "contacted" : l.deal_stage,
                                },
                              });
                            }}
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 md:px-4 md:py-2 rounded-full border transition-all ${
                              l.email_sent ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-muted/50 border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span className={`size-2 rounded-full shrink-0 ${l.email_sent ? "bg-blue-400" : "bg-muted-foreground/40"}`} /> Emailed
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}

function rangeStart(r: Range): string {
  const d = new Date();
  if (r === "day") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (r === "week") d.setDate(d.getDate() - 6);
  else d.setDate(d.getDate() - 29);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AnalyticsView() {
  const [range, setRange] = useState<Range>("week");
  const start = rangeStart(range);

  const callsQ = useQuery({
    queryKey: ["analytics-calls", range],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_logs")
        .select("id,call_date,result,notes,objection_source")
        .gte("call_date", start)
        .order("call_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const runObjections = useServerFn(analyzeObjections);
  const runCoaching = useServerFn(generateCoaching);

  const coachingM = useMutation({
    mutationFn: async (objections: { label: string; count: number }[]) =>
      runCoaching({ data: { objections, totalCalls: total, transfers, meetings, voicemails } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const objectionsM = useMutation({
    mutationFn: async () => {
      const entries = (callsQ.data ?? []).map((c) =>
        [c.result, c.objection_source, c.notes].filter(Boolean).join(" | ")
      ).filter((e) => e.trim().length > 0);
      return runObjections({ data: { entries } });
    },
    onSuccess: (data) => {
      if (data.objections.length > 0) coachingM.mutate(data.objections);
    },

    onError: (e: Error) => toast.error(e.message),
  });

  const calls = callsQ.data ?? [];
  const total = calls.length;
  const transfers = calls.filter((c) => c.result === "Transferred").length;
  const voicemails = calls.filter((c) => c.result === "Voicemail").length;
  const meetings = calls.filter((c) => c.result === "Meeting Booked").length;

  const agentVoicemails: [string, number][] = [];
  const rangeLabel = range === "day" ? "Today" : range === "week" ? "This week" : "This month";

  return (
    <div className="space-y-6">
      <div className="flex gap-0.5 bg-muted rounded-full px-2 py-1 w-fit mt-8">
        {(["day", "week", "month"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              range === r ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10"
            }`}
          >
            {r === "day" ? "Today" : r === "week" ? "This week" : "This month"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={`Total calls (${rangeLabel.toLowerCase()})`} value={total} />
        <Stat label="Transfers to DM" value={transfers} accent="primary" />
        <Stat label="Voicemails left" value={voicemails} />
        <Stat label="Meetings booked" value={meetings} accent="success" />
      </div>

      {agentVoicemails.length > 1 && (
        <section className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-3">Voicemails by agent</h3>
          <ul className="space-y-2">
            {agentVoicemails.map(([agent, count]) => (
              <li key={agent} className="flex items-center gap-3 text-sm">
                <span className="w-32 truncate text-muted-foreground">{agent}</span>
                <div className="flex-1 bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: `${(count / voicemails) * 100}%` }} />
                </div>
                <span className="stat-num font-semibold text-xs w-6 text-right">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-3">Call outcomes — {rangeLabel.toLowerCase()}</h3>
        {callsQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : total === 0 ? (
          <p className="text-xs text-muted-foreground">No calls logged {rangeLabel.toLowerCase()}.</p>
        ) : (
          <ul className="space-y-3">
            {([
              { label: "No Answer", count: calls.filter((c) => c.result === "No Answer").length, gradient: "linear-gradient(to right, #3B82F6, #6366F1)" },
              { label: "Voicemail left", count: voicemails, gradient: "linear-gradient(to right, #8B5CF6, #A78BFA)" },
              { label: "Objection — Gatekeeper", count: calls.filter((c) => c.result === "Objection/Not Interested" && c.objection_source === "gatekeeper").length, gradient: "linear-gradient(to right, #EF4444, #F97316)" },
              { label: "Objection — Decision Maker", count: calls.filter((c) => c.result === "Objection/Not Interested" && c.objection_source === "decision_maker").length, gradient: "linear-gradient(to right, #EF4444, #F97316)" },
              { label: "Transferred to DM", count: transfers, gradient: "linear-gradient(to right, #06B6D4, #14B8A6)" },
              { label: "Meeting Booked", count: meetings, gradient: "linear-gradient(to right, #22C55E, #10B981)" },
            ] as { label: string; count: number; gradient: string }[])
              .filter((o) => o.count > 0)
              .map((o) => (
                <li key={o.label} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{o.label}</span>
                    <span className="stat-num text-xs font-semibold">{o.count}</span>
                  </div>
                  <div className="bg-muted rounded-full h-2">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${(o.count / total) * 100}%`, background: o.gradient }} />
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm inline-flex items-center gap-1.5">
            <Sparkles className="size-4 text-primary" /> Top objections from call notes
          </h3>
          <button
            onClick={() => objectionsM.mutate()}
            disabled={objectionsM.isPending || calls.length === 0}
            className="text-xs bg-primary text-primary-foreground rounded px-2.5 py-1 font-semibold disabled:opacity-40"
          >
            {objectionsM.isPending ? "Analyzing…" : objectionsM.data ? "Re-analyze" : "Analyze"}
          </button>
        </div>
        {!objectionsM.data ? (
          <p className="text-xs text-muted-foreground">
            {total} call{total === 1 ? "" : "s"} {rangeLabel.toLowerCase()} — click Analyze to cluster call patterns with AI.
          </p>
        ) : objectionsM.data.error ? (
          <p className="text-xs text-destructive">{objectionsM.data.error}</p>
        ) : objectionsM.data.objections.length === 0 ? (
          <p className="text-xs text-muted-foreground">No patterns detected — try a wider time range.</p>
        ) : (
          <ul className="space-y-2">
            {objectionsM.data.objections.map((o) => {
              const maxCount = Math.max(...objectionsM.data!.objections.map((x) => x.count));
              return (
                <li key={o.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate">{o.label}</span>
                    <span className="stat-num text-xs font-semibold text-primary ml-2">×{o.count}</span>
                  </div>
                  <div className="bg-muted rounded-full h-1.5">
                    <div className="bg-primary h-1.5 rounded-full" style={{ width: `${(o.count / maxCount) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(coachingM.isPending || coachingM.data) && (
        <section className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-sm inline-flex items-center gap-1.5 mb-3">
            <Sparkles className="size-4 text-primary" /> AI coach
          </h3>
          {coachingM.isPending ? (
            <p className="text-xs text-muted-foreground animate-pulse">Analyzing your calls…</p>
          ) : coachingM.data?.error ? (
            <p className="text-xs text-destructive">{coachingM.data.error}</p>
          ) : (
            <div className="space-y-4">
              {coachingM.data!.summary && (
                <p className="text-sm text-muted-foreground leading-relaxed">{coachingM.data!.summary}</p>
              )}
              <div className="space-y-3">
                {coachingM.data!.tips.map((tip, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="mt-0.5 size-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <p className="text-sm text-foreground/90 leading-relaxed">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "primary" | "success" }) {
  const color = accent === "primary" ? "text-primary" : accent === "success" ? "text-success" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold stat-num mt-1 ${color}`}>{value}</div>
    </div>
  );
}
