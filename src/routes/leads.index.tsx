import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { STAGE_COLOR, STAGE_LABEL, todayISO, fmtDate } from "@/lib/crm";
import { analyzeObjections } from "@/lib/analytics.functions";
import { fetchNotionLeads, fetchNotionFollowUps, fetchNotionAnalytics, markNotionLead } from "@/lib/notion.functions";
import { useServerFn } from "@tanstack/react-start";
import { Search, Plus, Phone, Mail, CalendarClock, Sparkles, BarChart3, Undo2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/leads/")({
  head: () => ({ meta: [{ title: "Leads — Sales Command Center" }] }),
  component: LeadsPage,
});

type Tab = "all" | "called" | "contacted" | "meeting" | "analytics";
type Range = "day" | "week" | "month";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All Leads" },
  { id: "called", label: "Called" },
  { id: "contacted", label: "Contacted" },
  { id: "meeting", label: "Meeting Booked" },
  { id: "analytics", label: "Analytics" },
];

function dealStage(l: { called: boolean; email_sent: boolean; contact_status: string | null; demo_booked: boolean; deal_closed: boolean; follow_up_needed: boolean }) {
  if (l.deal_closed) return "client";
  if (l.demo_booked) return "meeting_booked";
  if (l.contact_status === "Interested" || (l.called && l.follow_up_needed)) return "follow_up";
  if (l.called || l.email_sent) return "contacted";
  return "new_lead";
}

function LeadsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");

  const today = todayISO();

  const fetchLeads = useServerFn(fetchNotionLeads);
  const fetchFollowUps = useServerFn(fetchNotionFollowUps);
  const markLead = useServerFn(markNotionLead);

  const listQ = useQuery({
    queryKey: ["notion-leads", tab, limit, search],
    enabled: tab !== "analytics",
    queryFn: async () => {
      if (tab === "all") {
        const [leads, followups] = await Promise.all([
          fetchLeads({ data: { tab: "all", search, limit } }),
          fetchFollowUps({ data: { today } }),
        ]);
        const seen = new Set<string>();
        const merged = [];
        for (const l of followups) { if (!seen.has(l.id)) { seen.add(l.id); merged.push({ ...l, followUpToday: true }); } }
        for (const l of leads) { if (!seen.has(l.id)) { seen.add(l.id); merged.push({ ...l, followUpToday: false }); } }
        return merged;
      }
      const leads = await fetchLeads({ data: { tab, search, limit } });
      return leads.map(l => ({ ...l, followUpToday: false }));
    },
  });

  const calledMut = useMutation({
    mutationFn: async ({ pageUrl, called }: { pageUrl: string; called: boolean }) => {
      return markLead({ data: { pageUrl, called } });
    },
    onSuccess: () => {
      toast.success("Updated in Notion ✓");
      qc.invalidateQueries({ queryKey: ["notion-leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emailMut = useMutation({
    mutationFn: async ({ pageUrl, emailSent }: { pageUrl: string; emailSent: boolean }) => {
      return markLead({ data: { pageUrl, emailSent } });
    },
    onSuccess: () => {
      toast.success("Updated in Notion ✓");
      qc.invalidateQueries({ queryKey: ["notion-leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leads = listQ.data ?? [];

  return (
    <AppShell>
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Leads</h1>
          <p className="text-xs text-muted-foreground">Live from Notion</p>
        </div>
        <Link to="/leads/new" className="inline-flex items-center gap-1 bg-card border border-border rounded-md px-3 py-2 text-sm font-semibold hover:border-primary">
          <Plus className="size-4" /> Add
        </Link>
      </header>

      <div className="flex gap-1 mb-3 bg-card rounded-lg p-1 border border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.id === "analytics"
              ? <span className="inline-flex items-center gap-1"><BarChart3 className="size-3.5" /> {t.label}</span>
              : t.label}
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
              {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {listQ.isLoading ? (
              <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                Loading from Notion…
              </div>
            ) : leads.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Nothing here.</div>
            ) : (
              <ul className="divide-y divide-border">
                {leads.map((l) => {
                  const stage = dealStage(l);
                  return (
                    <li key={l.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/30">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{l.company}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STAGE_COLOR[stage] || ""}`}>
                            {STAGE_LABEL[stage] ?? stage}
                          </span>
                          {l.followUpToday && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning/20 text-warning inline-flex items-center gap-1">
                              <CalendarClock className="size-3" />
                              Follow up {l.outreach_date === today ? "today" : fmtDate(l.outreach_date)}
                            </span>
                          )}
                          {l.notes && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={l.notes}>
                              📝 {l.notes}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate stat-num mt-0.5">
                          {[l.contact_name, l.phone, l.location].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {l.called ? (
                          <button
                            title="Undo call"
                            onClick={() => calledMut.mutate({ pageUrl: l.id, called: false })}
                            disabled={calledMut.isPending}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors bg-success/20 border-success text-success hover:bg-destructive/20 hover:border-destructive hover:text-destructive"
                          >
                            <Phone className="size-3.5" /> Called <Undo2 className="size-3 opacity-60" />
                          </button>
                        ) : (
                          <button
                            title="Mark as called"
                            onClick={() => calledMut.mutate({ pageUrl: l.id, called: true })}
                            disabled={calledMut.isPending}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors bg-input border-border text-muted-foreground hover:border-primary hover:text-foreground"
                          >
                            <Phone className="size-3.5" /> Called
                          </button>
                        )}
                        <button
                          title="Mark as contacted (email)"
                          onClick={() => emailMut.mutate({ pageUrl: l.id, emailSent: !l.email_sent })}
                          disabled={emailMut.isPending}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                            l.email_sent
                              ? "bg-accent border-primary text-primary"
                              : "bg-input border-border text-muted-foreground hover:border-primary hover:text-foreground"
                          }`}
                        >
                          <Mail className="size-3.5" /> Contacted
                        </button>
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
  if (r === "day") return todayISO();
  if (r === "week") d.setDate(d.getDate() - 6);
  else d.setDate(d.getDate() - 29);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AnalyticsView() {
  const [range, setRange] = useState<Range>("week");
  const fetchAnalytics = useServerFn(fetchNotionAnalytics);
  const runObjections = useServerFn(analyzeObjections);

  const callsQ = useQuery({
    queryKey: ["notion-analytics", range],
    queryFn: () => fetchAnalytics({ data: { since: rangeStart(range) } }),
  });

  const objectionsM = useMutation({
    mutationFn: async () => {
      const notes = (callsQ.data ?? []).map((c: any) => c.notes).filter((n: any): n is string => !!n && n.trim().length > 3);
      return runObjections({ data: { notes } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const calls = callsQ.data ?? [];
  const total = calls.length;
  const uniqueLeads = new Set(calls.map((c: any) => c.id)).size;
  const interested = calls.filter((c: any) => c.result === "Interested").length;
  const meetings = calls.filter((c: any) => c.result === "Meeting Booked" || c.demo_booked).length;
  const rangeLabel = range === "day" ? "Today" : range === "week" ? "This week" : "This month";

  const byDay = new Map<string, number>();
  for (const c of calls as any[]) {
    if (c.call_date) byDay.set(c.call_date, (byDay.get(c.call_date) ?? 0) + 1);
  }
  const span = range === "day" ? 1 : range === "week" ? 7 : 30;
  const days: { date: string; count: number }[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date: iso, count: byDay.get(iso) ?? 0 });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-card rounded-lg p-1 border border-border w-fit">
        {(["day", "week", "month"] as Range[]).map((r) => (
          <button key={r} onClick={() => range !== r && objectionsM.reset !== undefined && setRange(r)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium ${range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setRange(r)}
          >
            {r === "day" ? "Today" : r === "week" ? "This week" : "This month"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground">Unique leads called</div>
          <div className="text-2xl font-bold stat-num mt-1">{uniqueLeads}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{total} total calls</div>
        </div>
        <Stat label="Interested" value={interested} accent="primary" />
        <Stat label="Meetings booked" value={meetings} accent="success" />
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground">Daily goal</div>
          <div className="text-2xl font-bold stat-num mt-1 text-primary">{range === "day" ? `${Math.round((total / 100) * 100)}%` : "—"}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">100 calls/day</div>
        </div>
      </div>

      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-3">Call volume — {rangeLabel.toLowerCase()}</h3>
        {callsQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading from Notion…</div>
        ) : range === "day" ? (
          <div className="text-center py-4">
            <p className="text-3xl font-bold stat-num text-primary">{total}</p>
            <p className="text-xs text-muted-foreground mt-1">calls today · Goal: 100</p>
            <div className="mt-3 bg-muted rounded-full h-2 w-full">
              <div className="bg-primary h-2 rounded-full" style={{ width: `${Math.min((total / 100) * 100, 100)}%` }} />
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {days.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="flex-1 w-full flex items-end">
                  <div className="w-full bg-primary/70 hover:bg-primary rounded-t"
                    style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: d.count > 0 ? 4 : 0 }}
                    title={`${d.date}: ${d.count}`} />
                </div>
                {span <= 7 && (
                  <span className="text-[10px] text-muted-foreground stat-num">
                    {new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                )}
              </div>
            ))}
          </div>
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
            Click Analyze — reads your {calls.filter((c: any) => c.notes).length} call notes {rangeLabel.toLowerCase()}.
          </p>
        ) : objectionsM.data.objections.length === 0 ? (
          <p className="text-xs text-muted-foreground">No objections detected yet.</p>
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
