import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { CALL_RESULTS, OBJECTION_SOURCES, todayISO, fmtDate } from "@/lib/crm";
import { parseFollowUpDate } from "@/lib/ai.functions";
import { parseFollowUpRegex } from "@/lib/follow-up-parser";
import { Phone, X, Sparkles, Copy, Check, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { CallSheetLead } from "@/components/CallLogSheet";

export function CallLogInline({
  lead,
  onClose,
  onLogged,
}: {
  lead: CallSheetLead;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [result, setResult] = useState<string>("No Answer");
  const [objectionSource, setObjectionSource] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [copied, setCopied] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const parser = useServerFn(parseFollowUpDate);
  const [parseHint, setParseHint] = useState<{ date: string; snippet: string | null } | null>(null);

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
      } catch (e: unknown) { console.warn(e); }
    }, 900);
    return () => clearTimeout(t);
  }, [notes, parser]);

  const copyPhone = async () => {
    if (!lead.phone) return;
    try {
      await navigator.clipboard.writeText(lead.phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Couldn't copy"); }
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
        objection_source: result === "Objection/Not Interested" ? objectionSource : null,
      });
      if (e1) throw e1;
      const patch: Record<string, unknown> = {
        called: true,
        last_contact_date: today,
        last_call_result: result,
        next_follow_up: followUp || null,
        follow_up_source: followUp ? (notes || null) : null,
      };
      if (followUp) patch.deal_stage = "follow_up";
      else if (result === "Meeting Booked") patch.deal_stage = "meeting_booked";
      else if (result === "Objection/Not Interested") patch.deal_stage = "lost";
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
    <div className="bg-card border border-primary/40 rounded-xl mx-2 my-2 shadow-lg">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold truncate">Log call · {lead.company}</span>
          {lead.contact_name && <span className="text-xs text-muted-foreground truncate">· {lead.contact_name}</span>}
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      {lead.phone && (
        <div className="px-4 pt-3 flex items-center gap-2 flex-wrap">
          <button
            onClick={copyPhone}
            className="stat-num text-sm font-semibold tracking-wide bg-muted/40 hover:bg-muted rounded-lg px-3 py-1.5 inline-flex items-center gap-2"
            title="Tap to copy"
          >
            {lead.phone}
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-3.5 text-muted-foreground" />}
          </button>
          <a
            href={`tel:${lead.phone}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-full px-3 py-1.5"
          >
            <Phone className="size-3.5" /> Dial
          </a>
        </div>
      )}

      <div className="px-4 py-4 space-y-5">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Call result</label>
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {CALL_RESULTS.slice(0, -1).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setResult(r); if (r !== "Objection/Not Interested") setObjectionSource(null); }}
                  className={`text-xs py-3 px-3 rounded-xl border font-bold transition-all leading-tight ${
                    result === r
                      ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/30"
                      : "bg-muted/30 border-border text-foreground hover:border-primary/50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setResult("Meeting Booked")}
              className={`w-full text-sm py-3 px-4 rounded-xl border font-bold transition-all ${
                result === "Meeting Booked"
                  ? "bg-success text-white border-success shadow-md shadow-success/30"
                  : "bg-success/10 border-success/40 text-success hover:bg-success/20 hover:border-success/60"
              }`}
            >
              Meeting Booked
            </button>
          </div>
          {result === "Objection/Not Interested" && (
            <div className="mt-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Came from</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {OBJECTION_SOURCES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setObjectionSource(s.value)}
                    className={`text-xs py-2.5 px-3 rounded-xl border font-bold transition-all ${
                      objectionSource === s.value
                        ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/30"
                        : "bg-muted/30 border-border text-foreground hover:border-primary/50"
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
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
            Notes <Sparkles className="size-3 text-primary" /> <span className="text-[10px] normal-case tracking-normal text-muted-foreground">AI auto-detects follow-up dates</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder='e.g. "Office manager said try again in 2 weeks"'
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

        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Follow-up date (optional)</label>
          <div className="mt-2">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`w-full text-sm py-2.5 px-3 rounded-lg border font-medium transition-colors inline-flex items-center gap-2 ${
                    calendarOpen
                      ? "bg-muted border-primary text-primary"
                      : followUp
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-muted/30 border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  <CalendarIcon className="size-4" />
                  {followUp ? fmtDate(followUp) : "Pick a date…"}
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
          </div>
        </div>

        <button
          onClick={() => log.mutate()}
          disabled={log.isPending || (result === "Objection/Not Interested" && !objectionSource)}
          className="w-full bg-gradient-to-r from-primary to-success text-primary-foreground rounded-xl py-3 font-bold text-base shadow-lg disabled:opacity-50"
        >
          {log.isPending ? "Saving…" : "Save call"}
        </button>
      </div>
    </div>
  );
}
