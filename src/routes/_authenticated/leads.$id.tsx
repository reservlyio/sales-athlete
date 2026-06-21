import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { CALL_RESULTS, OBJECTION_SOURCES, DEAL_STAGES, STAGE_COLOR, STAGE_LABEL, todayISO, fmtDate } from "@/lib/crm";
import { parseFollowUpDate } from "@/lib/ai.functions";
import { parseFollowUpRegex } from "@/lib/follow-up-parser";
import { toast } from "sonner";
import { ArrowLeft, Phone, Mail, Globe, MapPin, Sparkles, X, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  head: () => ({ meta: [{ title: "Lead" }] }),
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
  const qc = useQueryClient();
  const nav = useNavigate();

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
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STAGE_COLOR[lead.deal_stage] || ""}`}>
            {STAGE_LABEL[lead.deal_stage] ?? lead.deal_stage}
          </span>
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
      <LogCallPanel lead={lead} onLogged={() => { qc.invalidateQueries(); }} />

      {/* Toggles + stage */}
      <section className="bg-card border border-border rounded-xl p-5 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={lead.called}
              onChange={async (e) => {
                if (e.target.checked) {
                  updateLead.mutate({ called: true, last_contact_date: todayISO() });
                  return;
                }
                // Uncheck: reset call-related fields but keep email_sent intact
                const { error: delErr } = await supabase.from("call_logs").delete().eq("lead_id", id);
                if (delErr) { toast.error(delErr.message); return; }
                updateLead.mutate({
                  called: false,
                  last_contact_date: null,
                  last_call_result: null,
                  deal_stage: lead.email_sent ? "contacted" : "new_lead",
                  next_follow_up: null,
                  follow_up_source: null,
                });
                qc.invalidateQueries({ queryKey: ["lead-logs", id] });
                qc.invalidateQueries({ queryKey: ["leads-list"] });
                toast.success("Moved back to All Leads");
              }}
              className="size-4 accent-primary"
            />
            Called
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={lead.email_sent}
              onChange={(e) => updateLead.mutate({ email_sent: e.target.checked })}
              className="size-4 accent-primary"
            />
            Email sent
          </label>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Stage</label>
          <select
            value={lead.deal_stage}
            onChange={(e) => updateLead.mutate({ deal_stage: e.target.value })}
            className="w-full mt-1 bg-input border border-border rounded-md px-3 py-2 text-sm"
          >
            {DEAL_STAGES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground stat-num">
          <div>Last contact: <span className="text-foreground">{fmtDate(lead.last_contact_date)}</span></div>
          <div>Next follow-up: <span className="text-foreground">{fmtDate(lead.next_follow_up)}</span></div>
        </div>
      </section>

      {/* Notes with AI date detection */}
      <NotesEditor lead={lead} onSaved={() => qc.invalidateQueries({ queryKey: ["lead", id] })} />

      {/* History */}
      <section className="mt-4 bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border font-semibold text-sm">Call history</div>
        {(logsQ.data ?? []).length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">No calls logged yet.</div>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {(logsQ.data ?? []).map((c) => (
              <li key={c.id} className="px-5 py-3">
                <div className="flex justify-between">
                  <span className="font-medium">{c.result}</span>
                  <span className="stat-num text-xs text-muted-foreground">{fmtDate(c.call_date)}</span>
                </div>
                {c.notes && <p className="text-xs text-muted-foreground mt-1">{c.notes}</p>}
                {c.follow_up_date && (
                  <p className="text-xs text-warning mt-1">Follow up: {fmtDate(c.follow_up_date)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        onClick={() => { if (confirm("Delete this lead?")) del.mutate(); }}
        className="mt-6 text-xs text-destructive hover:underline inline-flex items-center gap-1"
      >
        <Trash2 className="size-3" /> Delete lead
      </button>
    </AppShell>
  );
}

function LogCallPanel({ lead, onLogged }: { lead: Lead; onLogged: () => void }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string>("No Answer");
  const [objectionSource, setObjectionSource] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");

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
        // Each new call replaces the previous follow-up — clears if none in this note
        next_follow_up: followUp || null,
        follow_up_source: followUp ? (notes || null) : null,
      };
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
      setNotes(""); setFollowUp(""); setParseHint(null); setResult("No Answer"); setObjectionSource(null); setOpen(false);
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
    <section className="bg-card border-2 border-primary rounded-xl p-5 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Log call</h3>
        <button onClick={() => setOpen(false)} className="text-muted-foreground"><X className="size-4" /></button>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Result</label>
        <div className="grid grid-cols-2 gap-1.5 mt-1">
          {CALL_RESULTS.map((r, i) => (
            <button
              key={r}
              type="button"
              onClick={() => { setResult(r); if (r !== "Objection/Not Interested") setObjectionSource(null); }}
              className={`text-xs py-2 px-2 rounded-md border ${
                i === CALL_RESULTS.length - 1 && CALL_RESULTS.length % 2 === 1 ? "col-span-2 mx-auto w-1/2" : ""
              } ${
                result === r ? "bg-primary text-primary-foreground border-primary" : "bg-input border-border"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {result === "Objection/Not Interested" && (
          <div className="mt-1.5">
            <label className="text-xs text-muted-foreground">Came from</label>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {OBJECTION_SOURCES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setObjectionSource(s.value)}
                  className={`text-xs py-2 px-2 rounded-md border ${
                    objectionSource === s.value ? "bg-primary text-primary-foreground border-primary" : "bg-input border-border"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div>
        <label className="text-xs text-muted-foreground flex items-center gap-1">
          Notes <Sparkles className="size-3 text-primary" /> <span className="text-[10px]">AI auto-detects follow-up dates</span>
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
        <label className="text-xs text-muted-foreground">Follow-up date (optional)</label>
        <input
          type="date"
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          className="w-full mt-1 bg-input border border-border rounded-md px-3 py-2 text-sm"
        />
      </div>
      <button
        onClick={() => log.mutate()}
        disabled={log.isPending || (result === "Objection/Not Interested" && !objectionSource)}
        className="w-full bg-primary text-primary-foreground rounded-md py-2.5 font-semibold disabled:opacity-50"
      >
        {log.isPending ? "Saving…" : "Save call"}
      </button>
    </section>
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
