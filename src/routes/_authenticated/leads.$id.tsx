import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { CALL_RESULTS, OBJECTION_SOURCES, DEAL_STAGES, STAGE_COLOR, STAGE_LABEL, todayISO, fmtDate } from "@/lib/crm";
import { parseFollowUpDate } from "@/lib/ai.functions";
import { parseFollowUpRegex } from "@/lib/follow-up-parser";
import { toast } from "sonner";
import { ArrowLeft, Phone, Mail, Globe, MapPin, Sparkles, X, Trash2, CalendarIcon, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  head: () => ({ meta: [{ title: "Lead" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    logCall: search.logCall === "1" ? "1" as const : undefined,
  }),
  component: LeadDetail,
});

type Lead = {
  id: string;
  company: string;
  contact_name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  location: string | null;
  notes: string | null;
  called: boolean;
  email_sent: boolean;
  last_contact_date: string | null;
  last_call_result: string | null;
  deal_stage: string;
  next_follow_up: string | null;
  follow_up_source: string | null;
  created_at: string;
};

type CallLog = { id: string; call_date: string; result: string; notes: string | null; follow_up_date: string | null };

function LeadDetail() {
  const { id } = Route.useParams();
  const { logCall } = Route.useSearch();
  const qc = useQueryClient();
  const nav = useNavigate();

  const shouldAutoOpen = useRef(logCall === "1");

  useEffect(() => {
    if (shouldAutoOpen.current) {
      const url = new URL(window.location.href);
      url.searchParams.delete("logCall");
      window.history.replaceState(null, "", url.toString());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const leadQ = useQuery({
    queryKey: ["lead", id],
    queryFn: async (): Promise<Lead> => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Lead;
    },
  });

  const logsQ = useQuery({
    queryKey: ["lead-logs", id],
    queryFn: async (): Promise<CallLog[]> => {
      const { data, error } = await supabase
        .from("call_logs")
        .select("id,call_date,result,notes,follow_up_date")
        .eq("lead_id", id)
        .order("call_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as CallLog[];
    },
  });

  const updateLead = useMutation({
    mutationFn: async (patch: Partial<Lead>) => {
      const { error } = await supabase.from("leads").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [historyOpen, setHistoryOpen] = useState(true);
  const [collapsedLogs, setCollapsedLogs] = useState<Set<string>>(new Set());
  const toggleLog = (logId: string) =>
    setCollapsedLogs((prev) => { const n = new Set(prev); n.has(logId) ? n.delete(logId) : n.add(logId); return n; });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead deleted");
      qc.invalidateQueries();
      nav({ to: "/leads" });
    },
  });

  if (leadQ.isLoading) return <AppShell><div className="text-muted-foreground">Loading…</div></AppShell>;
  if (!leadQ.data) return <AppShell><div>Not found</div></AppShell>;
  const lead = leadQ.data;

  return (
    <AppShell>
      <Link to="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-4" /> Leads
      </Link>

      <header className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <StageChip stage={lead.deal_stage} onChange={(v) => updateLead.mutate({ deal_stage: v })} />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold">{lead.company}</h1>
        {lead.contact_name && (
          <p className="text-sm text-muted-foreground">
            {lead.contact_name}
            {lead.title && ` · ${lead.title}`}
          </p>
        )}
      </header>

      {/* Quick contact */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="bg-primary text-primary-foreground rounded-md py-2.5 px-3 text-sm font-semibold flex items-center justify-center gap-1.5">
            <Phone className="size-4" /> Call
          </a>
        )}
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="bg-card border border-border rounded-md py-2.5 px-3 text-sm font-semibold flex items-center justify-center gap-1.5">
            <Mail className="size-4" /> Email
          </a>
        )}
        {lead.website && (
          <a href={lead.website} target="_blank" rel="noreferrer" className="bg-card border border-border rounded-md py-2.5 px-3 text-sm font-semibold flex items-center justify-center gap-1.5">
            <Globe className="size-4" /> Site
          </a>
        )}
        {lead.location && (
          <span className="bg-card border border-border rounded-md py-2.5 px-3 text-xs flex items-center justify-center gap-1.5 text-muted-foreground">
            <MapPin className="size-4" /> {lead.location}
          </span>
        )}
      </div>

      {/* Log call panel */}
      <LogCallPanel lead={lead} onLogged={() => { qc.invalidateQueries(); }} autoOpen={shouldAutoOpen.current} />

      {/* Timeline card */}
      <div className="bg-card border border-border rounded-xl px-5 py-5 mb-5">
        <div className="flex items-center gap-6">
          <div className="text-left shrink-0">
            <div className="font-semibold text-sm stat-num">{fmtDate(lead.last_contact_date)}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">Last contact</div>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="text-right shrink-0">
            <div className="font-semibold text-sm stat-num">{fmtDate(lead.next_follow_up)}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">Next follow-up</div>
          </div>
        </div>
      </div>

      {/* Notes with AI date detection */}
      <div className="mb-5">
        <NotesEditor lead={lead} onSaved={() => qc.invalidateQueries({ queryKey: ["lead", id] })} />
      </div>

      {/* History — hidden when empty, collapsible, starts open */}
      {(logsQ.data ?? []).length > 0 && (
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 border-b border-border font-semibold text-sm hover:bg-muted/30 transition-colors"
          >
            <span>Call history</span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-normal">
                {logsQ.data!.length} call{logsQ.data!.length === 1 ? "" : "s"}
              </span>
              <ChevronDown className={`size-4 text-muted-foreground transition-transform ${historyOpen ? "" : "-rotate-90"}`} />
            </span>
          </button>
          {historyOpen && (
            <ul className="divide-y divide-border text-sm">
              {logsQ.data!.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => toggleLog(c.id)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors text-left"
                  >
                    <span className="font-medium">{c.result}</span>
                    <span className="flex items-center gap-2">
                      <span className="stat-num text-xs text-muted-foreground">{fmtDate(c.call_date)}</span>
                      <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${collapsedLogs.has(c.id) ? "-rotate-90" : ""}`} />
                    </span>
                  </button>
                  {!collapsedLogs.has(c.id) && (c.notes || c.follow_up_date) && (
                    <div className="px-5 pb-3 space-y-1">
                      {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                      {c.follow_up_date && (
                        <p className="text-xs text-warning">Follow up: {fmtDate(c.follow_up_date)}</p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <button
        onClick={() => { if (confirm("Delete this lead?")) del.mutate(); }}
        className="mt-6 text-xs text-destructive hover:underline inline-flex items-center gap-1"
      >
        <Trash2 className="size-3" /> Delete lead
      </button>
    </AppShell>
  );
}

function LogCallPanel({ lead, onLogged, autoOpen }: { lead: Lead; onLogged: () => void; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const [result, setResult] = useState<string>("");
  const [objectionSource, setObjectionSource] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [clearFollowUp, setClearFollowUp] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const parser = useServerFn(parseFollowUpDate);
  const [parseHint, setParseHint] = useState<{ date: string; snippet: string | null } | null>(null);

  // Regex first, AI fallback
  useEffect(() => {
    if (!notes.trim() || notes.trim().length < 3) { setParseHint(null); return; }
    const local = parseFollowUpRegex(notes, todayISO());
    if (local.found && local.date) {
      setParseHint({ date: local.date, snippet: local.snippet });
      setFollowUp(local.date);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const out = await parser({ data: { text: notes, today: todayISO() } });
        if (out.found && out.date) {
          setParseHint({ date: out.date, snippet: out.snippet });
          setFollowUp(out.date);
        }
      } catch (e: unknown) {
        console.warn(e);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [notes, parser]);

  const log = useMutation({
    mutationFn: async () => {
      const today = todayISO();
      const { error: e1 } = await supabase.from("call_logs").insert({
        lead_id: lead.id,
        company: lead.company,
        call_date: today,
        result,
        notes: notes || null,
        follow_up_date: followUp || null,
        objection_source: result === "Objection/Not Interested" ? objectionSource : null,
      });
      if (e1) throw e1;
      const patch: Partial<Lead> = {
        called: true,
        last_contact_date: today,
        last_call_result: result,
      };
      if (followUp) {
        // A new follow-up was set for this call — replaces the previous one
        patch.next_follow_up = followUp;
        patch.follow_up_source = notes || null;
      } else if (clearFollowUp) {
        // User explicitly chose to clear the existing follow-up
        patch.next_follow_up = null;
        patch.follow_up_source = null;
      }
      // else: no new date and not explicitly cleared — leave existing next_follow_up untouched

      if (followUp) {
        patch.deal_stage = "follow_up";
      } else if (result === "Meeting Booked") {
        patch.deal_stage = "meeting_booked";
      } else if (result === "Objection/Not Interested") {
        patch.deal_stage = "lost";
      }
      const { error: e2 } = await supabase.from("leads").update(patch).eq("id", lead.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Call logged");
      setNotes(""); setFollowUp(""); setClearFollowUp(false); setParseHint(null); setResult(""); setObjectionSource(null); setOpen(false);
      onLogged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-semibold mb-4 flex items-center justify-center gap-2"
      >
        <Phone className="size-4" /> Log a call
      </button>
    );
  }

  return (
    <section className="bg-card border-2 border-primary rounded-xl p-5 mb-4 space-y-7">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Log call</h3>
        <button onClick={() => setOpen(false)} className="text-muted-foreground"><X className="size-4" /></button>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">Result</label>
        <div className="space-y-2.5 mt-1">
          <div className="grid grid-cols-2 gap-2.5">
            {CALL_RESULTS.slice(0, -1).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => { setResult(r); if (r !== "Objection/Not Interested") setObjectionSource(null); }}
                className={`text-xs py-4 px-3 rounded-2xl border font-medium leading-normal transition-all ${
                  result === r ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 border-border text-foreground/80 hover:text-foreground hover:bg-muted"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {result === "Objection/Not Interested" && (
            <div>
              <label className="text-xs text-muted-foreground">Came from</label>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {OBJECTION_SOURCES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setObjectionSource(s.value)}
                    className={`text-xs py-3 px-3 rounded-2xl border font-medium transition-all ${
                      objectionSource === s.value ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 border-border text-foreground/80 hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setResult("Meeting Booked")}
            className={`w-full text-xs py-4 px-4 rounded-2xl border font-medium transition-all ${
              result === "Meeting Booked"
                ? "bg-success text-white border-success"
                : "bg-success/10 border-success/40 text-success/80 hover:text-success hover:bg-success/20"
            }`}
          >
            Meeting Booked
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
          Notes <Sparkles className="size-3 text-primary" />
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder='e.g. "Office manager said try again in 2 weeks"'
          className="w-full mt-1 bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
        {parseHint && (
          <div className="mt-2 flex items-center gap-2 text-xs bg-primary/10 text-primary rounded-md px-2 py-1.5 border border-primary/30">
            <Sparkles className="size-3" />
            Follow-up set for <strong>{fmtDate(parseHint.date)}</strong>
            {parseHint.snippet && <span className="opacity-70">· "{parseHint.snippet}"</span>}
            <button type="button" onClick={() => { setFollowUp(""); setParseHint(null); }} className="ml-auto opacity-60 hover:opacity-100">
              <X className="size-3" />
            </button>
          </div>
        )}
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">Follow-up date (optional)</label>
        <div className="mt-2 flex items-center gap-2">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`text-sm py-2.5 px-5 rounded-full border font-medium transition-colors inline-flex items-center gap-2 ${
                  calendarOpen
                    ? "bg-muted border-primary text-primary"
                    : followUp
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-muted/30 border-border text-foreground hover:border-primary/50"
                }`}
              >
                <CalendarIcon className="size-4" />
                {followUp ? fmtDate(followUp) : "Select a date"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={followUp ? new Date(followUp + "T00:00:00") : undefined}
                onSelect={(date) => {
                  setFollowUp(date ? date.toISOString().split("T")[0] : "");
                  setCalendarOpen(false);
                }}
                disabled={{ before: new Date(todayISO() + "T00:00:00") }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {followUp && (
            <button type="button" onClick={() => setFollowUp("")} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="size-4" />
            </button>
          )}
        </div>
        {!followUp && lead.next_follow_up && (
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={clearFollowUp}
              onChange={(e) => setClearFollowUp(e.target.checked)}
            />
            Clear existing follow-up ({fmtDate(lead.next_follow_up)}) instead of keeping it
          </label>
        )}
      </div>
      <button
        onClick={() => log.mutate()}
        disabled={log.isPending || !result || (result === "Objection/Not Interested" && !objectionSource)}
        className="w-full bg-primary text-primary-foreground rounded-full py-3 font-bold disabled:opacity-50"
      >
        {log.isPending ? "Saving…" : "Save call"}
      </button>
    </section>
  );
}

function StageChip({ stage, onChange }: { stage: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${STAGE_COLOR[stage] ?? "bg-gray-500/15 text-gray-400"}`}
      >
        <span className="size-1.5 rounded-full bg-current shrink-0" />
        {STAGE_LABEL[stage] ?? stage}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-card border border-border/60 rounded-xl shadow-lg p-1.5 flex flex-col gap-0.5 min-w-[160px]">
          {DEAL_STAGES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => { onChange(s.value); setOpen(false); }}
              className={`w-full inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full transition-colors ${STAGE_COLOR[s.value] ?? "bg-gray-500/15 text-gray-400"} ${stage === s.value ? "ring-1 ring-inset ring-current/50" : "opacity-60 hover:opacity-100"}`}
            >
              <span className="size-1.5 rounded-full bg-current shrink-0" />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesEditor({ lead, onSaved }: { lead: Lead; onSaved: () => void }) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const parser = useServerFn(parseFollowUpDate);
  const [hint, setHint] = useState<{ date: string; snippet: string | null } | null>(null);
  useEffect(() => { setNotes(lead.notes ?? ""); }, [lead.notes]);

  // Live-detect dates while typing (regex first, AI fallback)
  useEffect(() => {
    if (!notes.trim() || notes.trim().length < 3) { setHint(null); return; }
    if (notes === (lead.notes ?? "")) { setHint(null); return; }
    const local = parseFollowUpRegex(notes, todayISO());
    if (local.found && local.date) { setHint({ date: local.date, snippet: local.snippet }); return; }
    const t = setTimeout(async () => {
      try {
        const out = await parser({ data: { text: notes, today: todayISO() } });
        if (out.found && out.date) setHint({ date: out.date, snippet: out.snippet });
      } catch (e) { console.warn(e); }
    }, 900);
    return () => clearTimeout(t);
  }, [notes, lead.notes, parser]);

  const save = useMutation({
    mutationFn: async () => {
      const patch: Record<string, unknown> = { notes };
      if (hint?.date) {
        patch.next_follow_up = hint.date;
        patch.follow_up_source = notes || null;
        if (lead.deal_stage === "new_lead") patch.deal_stage = "follow_up";
      }
      const { error } = await supabase.from("leads").update(patch as never).eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(hint?.date ? `Notes saved · follow-up ${fmtDate(hint.date)}` : "Notes saved");
      setHint(null);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">Notes</h3>
        {notes !== (lead.notes ?? "") && (
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="text-xs bg-primary text-primary-foreground rounded px-2 py-1 font-semibold"
          >
            Save
          </button>
        )}
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
        placeholder="Persistent notes about this lead…"
      />
      {hint && (
        <div className="mt-2 flex items-center gap-2 text-xs bg-primary/10 text-primary rounded-md px-2 py-1.5 border border-primary/30">
          <Sparkles className="size-3" />
          On save: follow-up <strong>{fmtDate(hint.date)}</strong>
          {hint.snippet && <span className="opacity-70">· "{hint.snippet}"</span>}
          <button type="button" onClick={() => setHint(null)} className="ml-auto opacity-60 hover:opacity-100">
            <X className="size-3" />
          </button>
        </div>
      )}
    </section>
  );
}
