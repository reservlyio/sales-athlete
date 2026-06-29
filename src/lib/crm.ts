export const CALL_RESULTS = [
  "No Answer",
  "Voicemail",
  "Objection/Not Interested",
  "Transferred",
  "Meeting Booked",
] as const;

export const OBJECTION_SOURCES = [
  { value: "gatekeeper", label: "Gatekeeper" },
  { value: "decision_maker", label: "Decision Maker" },
] as const;

export const DEAL_STAGES = [
  { value: "new_lead", label: "New Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "follow_up", label: "Follow Up" },
  { value: "meeting_booked", label: "Meeting Booked" },
  { value: "client", label: "Client" },
  { value: "lost", label: "Lost" },
] as const;

export const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  DEAL_STAGES.map((s) => [s.value, s.label]),
);

export const STAGE_COLOR: Record<string, string> = {
  new_lead: "bg-transparent text-slate-500 dark:text-slate-400",
  contacted: "bg-sky-400/[.08] text-sky-600 dark:text-sky-400",
  follow_up: "bg-yellow-400/[.12] text-yellow-600 dark:text-yellow-400",
  meeting_booked: "bg-violet-400/[.08] text-violet-600 dark:text-violet-400",
  client: "bg-emerald-400/[.08] text-emerald-600 dark:text-emerald-400",
  lost: "bg-rose-400/[.08] text-rose-500 dark:text-rose-400",
};

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s + (s.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
