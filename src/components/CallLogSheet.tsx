import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { CALL_RESULTS, todayISO, fmtDate } from "@/lib/crm";
import { parseFollowUpDate } from "@/lib/ai.functions";
import { parseFollowUpRegex } from "@/lib/follow-up-parser";
import { Phone, X, Sparkles, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export type CallSheetLead = {
  id: string;
  company: string;
  contact_name: string | null;
  phone: string | null;
  deal_stage: string;
};

export function CallLogSheet({
  lead,
  onClose,
  onLogged,
}: {
  lead: CallSheetLead;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [result, setResult] = useState<string>("No Answer");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [copied, setCopied] = useState(false);
  const parser = useServerFn(parseFollowUpDate);
  const [parseHint, setParseHint] = useState<{ date: string; snippet: string | null } | null>(null);

  useEffect(() => {
    if (!notes.trim() || notes.trim().length < 3) { setParseHint(null); return; }
    // 1) Regex parse first (free, instant)
    const local = parseFollowUpRegex(notes, todayISO());
    if (local.found && local.date) {
      setParseHint({ date: local.date, snippet: local.snippet });
      setFollowUp(local.date);
      return;
    }
    // 2) Debounced AI fallback for fuzzy phrasing
    const t = setTimeout(async () => {
      try {
        const out = await parser({ data: { text: notes, today: todayISO() } });
        if (out.found && out.date) {
          setParseHint({ date: out.date, snippet: out.snippet });
          setFollowUp(out.date);
        }
      } catch (e: unknown) { console.warn(e); }
    }, 900);
    return () => clearTimeout(t);
  }, [notes, parser]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const copyPhone = async () => {
    if (!lead.phone) return;
    try {
      await navigator.clipboard.writeText(lead.phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

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
      });
      if (e1) throw e1;
      const patch: Record<string, unknown> = {
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
      } else if (result === "Not Interested") {
        patch.deal_stage = "lost";
      }
      const { error: e2 } = await supabase.from("leads").update(patch as never).eq("id", lead.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Call logged");
      onLogged();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md bg-card border-t md:border border-border md:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <button onClick={onClose} className="text-sm text-primary font-medium">Cancel</button>
          <div className="text-xs text-muted-foreground">Log call</div>
          <div className="w-12" />
        </div>

        {/* Lead summary + tap-to-copy phone */}
        <div className="px-5 pt-4 pb-2 text-center">
          <h2 className="text-xl font-bold">{lead.company}</h2>
          {lead.contact_name && <p className="text-sm text-muted-foreground mt-0.5">{lead.contact_name}</p>}
          {lead.phone && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <button
                onClick={copyPhone}
                className="stat-num text-lg font-semibold tracking-wide bg-muted/40 hover:bg-muted rounded-lg px-4 py-2 inline-flex items-center gap-2"
                title="Tap to copy"
              >
                {lead.phone}
                {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4 text-muted-foreground" />}
              </button>
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-full px-3 py-1.5"
              >
                <Phone className="size-3.5" /> Dial
              </a>
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="px-5 py-3 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Call result</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {CALL_RESULTS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setResult(r)}
                  className={`text-xs py-2.5 px-2 rounded-lg border font-medium transition-colors ${
                    result === r
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/30 border-border text-foreground hover:border-primary/50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              Quick note <Sparkles className="size-3 text-primary" />
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. Follow up Tuesday, send proposal…"
              className="w-full mt-2 bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            />
            {parseHint && (
              <div className="mt-2 flex items-center gap-2 text-xs bg-primary/10 text-primary rounded-md px-2 py-1.5 border border-primary/30">
                <Sparkles className="size-3" />
                Follow-up <strong>{fmtDate(parseHint.date)}</strong>
                <button type="button" onClick={() => { setFollowUp(""); setParseHint(null); }} className="ml-auto opacity-60 hover:opacity-100">
                  <X className="size-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Log Call */}
        <div className="p-4 border-t border-border">
          <button
            onClick={() => log.mutate()}
            disabled={log.isPending}
            className="w-full bg-gradient-to-r from-primary to-success text-primary-foreground rounded-xl py-3.5 font-bold text-base shadow-lg disabled:opacity-50"
          >
            {log.isPending ? "Saving…" : "Log Call"}
          </button>
        </div>
      </div>
    </div>
  );
}
