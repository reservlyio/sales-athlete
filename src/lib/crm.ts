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
  new_lead: "bg-muted text-muted-foreground border border-border",
  contacted: "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  follow_up: "bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800",
  meeting_booked: "bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800",
  client: "bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800",
  lost: "bg-red-100 text-red-600 border border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
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
