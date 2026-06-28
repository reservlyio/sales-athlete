import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import {
  CALL_RESULTS,
  OBJECTION_SOURCES,
  DEAL_STAGES,
  STAGE_COLOR,
  STAGE_LABEL,
  todayISO,
  fmtDate,
} from "@/lib/crm";
import { parseFollowUpDate } from "@/lib/ai.functions";
import { parseFollowUpRegex } from "@/lib/follow-up-parser";
import { toast } from "sonner";
import { ArrowLeft, Phone, Mail, Globe, MapPin, Sparkles, X, Trash2, ChevronDown } from "lucide-react";

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

type CallLog = {
  id: string;
  call_date: string;
  result: string;
  notes: string | null;
  follow_up_date: string | null;
};

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

  if (leadQ.isLoading)
    return (
      <AppShell>
        <div className="text-muted-foreground">Loading…</div>
      </AppShell>
    );
  if (!leadQ.data)
    return (
      <AppShell>
        <div>Not found</div>
      </AppShell>
    );
  const lead = leadQ.data;

  return (
    <AppShell>
      <Link
        to="/leads"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" /> Leads
      </Link>

      <header className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <StagePicker current={lead.deal_stage} onSelect={(s) => updateLead.mutate({ deal_stage: s })} />
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
          <a
            href={`tel:${lead.phone}`}
            className="bg-primary text-primary-foreground rounded-md py-2.5 px-3 text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <Phone className="size-4" /> Call
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="bg-card border border-border rounded-md py-2.5 px-3 text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <Mail className="size-4" /> Email
          </a>
        )}
        {lead.website && /^https?:\/\//i.test(lead.website) && (
          <a
            href={lead.website}
            target="_blank"
            rel="noreferrer"
            className="bg-card border border-border rounded-md py-2.5 px-3 text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <Globe className="size-4" /> Site
          </a>
        )}
        {lead.location && (
          <span className="bg-card border border-border rounded-md py-2.5 px-3 text-xs flex items-center justify-center gap-1.5 text-muted-foreground">
            <MapPin className="size-4" /> {lead.location}
          </span>
        )}
      </div>

      {/* Single combined call + notes panel */}
      <CallAndNotesPanel
        lead={lead}
        onLogged={() => {
          qc.invalidateQueries();
        }}
      />

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
                const { error: delErr } = await supabase
                  .from("call_logs")
                  .delete()
                  .eq("lead_id", id);
                if (delErr) {
                  toast.error(delErr.message);
                  return;
                }
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
      </section>

      <section className="bg-card border border-border rounded-xl overflow-hidden mb-4">
        <CallHistory logs={logsQ.data ?? []} logsLoading={logsQ.isLoading} />
      </section>

      <button
        onClick={() => {
          if (confirm("Delete this lead?")) del.mutate();
        }}
        className="mt-6 text-xs text-destructive hover:underline inline-flex items-center gap-1"
      >
        <Trash2 className="size-3" /> Delete lead
      </button>
    </AppShell>
  );
}

function StagePicker({ current, onSelect }: { current: string; onSelect: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`text-[11px] font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 ${STAGE_COLOR[current] || ""}`}
      >
        {STAGE_LABEL[current] ?? current}
        <ChevronDown className="size-3 opacity-70" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[170px]">
            {DEAL_STAGES.map((s) => (
              <button
                key={s.value}
                onClick={() => { onSelect(s.value); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2 ${current === s.value ? "font-semibold" : ""}`}
              >
                <span className={`size-2 rounded-full shrink-0 ${STAGE_COLOR[s.value]?.split(" ")[0] ?? "bg-muted"}`} />
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CallHistory({ logs, logsLoading }: { logs: CallLog[]; logsLoading: boolean }) {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        Call history {!logsLoading && logs.length > 0 && `(${logs.length})`}
        <ChevronDown className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        logsLoading ? (
          <div className="px-5 pb-4 text-sm text-muted-foreground">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="px-5 pb-4 text-sm text-muted-foreground">No calls logged yet.</div>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {logs.map((c) => {
              const hasDetail = !!(c.notes || c.follow_up_date);
              const isExpanded = expandedId === c.id;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => hasDetail && setExpandedId(isExpanded ? null : c.id)}
                    className={`w-full flex items-center justify-between px-5 py-3 text-left ${hasDetail ? "hover:bg-muted/30 cursor-pointer" : "cursor-default"}`}
                  >
                    <span className="font-medium">{c.result}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="stat-num text-xs text-muted-foreground">{fmtDate(c.call_date)}</span>
                      {hasDetail && (
                        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      )}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-5 pb-3 space-y-1">
                      {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                      {c.follow_up_date && <p className="text-xs text-warning">Follow up: {fmtDate(c.follow_up_date)}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}

function CallAndNotesPanel({
  lead,
  onLogged,
}: {
  lead: Lead;
  onLogged: () => void;
}) {
  const [result, setResult] = useState<string>("No Answer");
  const [objectionSource, setObjectionSource] = useState<string | null>(null);
  // This call's note only — never pre-filled from the lead's stored notes,
  // so it's visually and functionally separate from the running record below.
  const [callNote, setCallNote] = useState("");
  const [followUp, setFollowUp] = useState(lead.next_follow_up ?? "");

  const parser = useServerFn(parseFollowUpDate);
  const [parseHint, setParseHint] = useState<{ date: string; snippet: string | null } | null>(null);

  useEffect(() => {
    setFollowUp(lead.next_follow_up ?? "");
  }, [lead.next_follow_up]);

  // Regex first, AI fallback — only ever surfaced as a suggestion. Nothing
  // gets applied to the follow-up date until the user clicks "Use this date".
  useEffect(() => {
    if (!callNote.trim() || callNote.trim().length < 3) {
      setParseHint(null);
      return;
    }
    const local = parseFollowUpRegex(callNote, todayISO());
    if (local.found && local.date) {
      setParseHint({ date: local.date, snippet: local.snippet });
      return;
    }
    const t = setTimeout(async () => {
      try {
        const out = await parser({ data: { text: callNote, today: todayISO() } });
        if (out.found && out.date) setParseHint({ date: out.date, snippet: out.snippet });
      } catch (e: unknown) {
        console.warn(e);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [callNote, parser]);

  const log = useMutation({
    mutationFn: async () => {
      const today = todayISO();
      const { error: e1 } = await supabase.from("call_logs").insert({
        lead_id: lead.id,
        company: lead.company,
        call_date: today,
        result,
        notes: callNote || null,
        follow_up_date: followUp || null,
        objection_source: result === "Objection/Not Interested" ? objectionSource : null,
      });
      if (e1) throw e1;
      // Stage always derives from the follow-up date + result, so it can never
      // drift out of sync with what the Follow Up list actually filters on —
      // except terminal states (Client/Lost), which are set manually above and
      // shouldn't get silently overwritten by a routine call.
      const patch: Partial<Lead> & { deal_stage?: string } = {
        called: true,
        last_contact_date: today,
        last_call_result: result,
        next_follow_up: followUp || null,
        follow_up_source: followUp ? callNote || null : null,
        // The lead's Notes is just a mirror of the most recent call note —
        // it's not a separate thing you edit, so it can't go out of sync.
        notes: callNote || lead.notes,
      };
      if (lead.deal_stage !== "client") {
        let deal_stage = "contacted";
        if (followUp) deal_stage = "follow_up";
        else if (result === "Meeting Booked") deal_stage = "meeting_booked";
        else if (result === "Objection/Not Interested") deal_stage = "lost";
        patch.deal_stage = deal_stage;
      }
      const { error: e2 } = await supabase.from("leads").update(patch).eq("id", lead.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Call logged");
      setCallNote("");
      setParseHint(null);
      setResult("No Answer");
      setObjectionSource(null);
      onLogged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="bg-card border-2 border-primary rounded-xl overflow-hidden mb-4">
      <div className="p-5 space-y-3">
        <h3 className="font-semibold">Log call</h3>
        <div>
          <label className="text-xs text-muted-foreground">Result</label>
          <div className="grid grid-cols-2 gap-1.5 mt-1">
            {CALL_RESULTS.map((r, i) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setResult(r);
                  if (r !== "Objection/Not Interested") setObjectionSource(null);
                }}
                className={`text-xs py-2 px-2 rounded-md border ${
                  i === CALL_RESULTS.length - 1 && CALL_RESULTS.length % 2 === 1
                    ? "col-span-2 mx-auto w-1/2"
                    : ""
                } ${
                  result === r
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-input border-border"
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
                      objectionSource === s.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-input border-border"
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
            Note for this call <Sparkles className="size-3 text-primary" />
          </label>
          <textarea
            value={callNote}
            onChange={(e) => setCallNote(e.target.value)}
            rows={3}
            placeholder='e.g. "Office manager said try again in 2 weeks"'
            className="w-full mt-1 bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
          {parseHint && (
            <div className="mt-2 flex items-center gap-2 text-xs bg-primary/10 text-primary rounded-md px-2 py-1.5 border border-primary/30">
              <Sparkles className="size-3" />
              Looks like <strong>{fmtDate(parseHint.date)}</strong>
              {parseHint.snippet && <span className="opacity-70">· "{parseHint.snippet}"</span>}
              <button
                type="button"
                onClick={() => {
                  setFollowUp(parseHint.date);
                  setParseHint(null);
                }}
                className="ml-auto font-semibold text-primary hover:underline"
              >
                Use this date
              </button>
              <button
                type="button"
                onClick={() => setParseHint(null)}
                className="opacity-60 hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => log.mutate()}
          disabled={log.isPending || (result === "Objection/Not Interested" && !objectionSource)}
          className="w-full bg-primary text-primary-foreground rounded-md py-2.5 font-semibold disabled:opacity-50"
        >
          {log.isPending ? "Saving…" : "Save call"}
        </button>
        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground stat-num pt-1">
          <div>Last contact: <span className="text-foreground">{fmtDate(lead.last_contact_date)}</span></div>
          <div>Next follow-up: <span className="text-foreground">{fmtDate(lead.next_follow_up)}</span></div>
        </div>
      </div>

    </section>
  );
}
