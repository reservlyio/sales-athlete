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
  new_lead: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  contacted: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  follow_up: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  meeting_booked: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  client: "bg-green-500/10 text-green-700 dark:text-green-400",
  lost: "bg-red-500/10 text-red-600 dark:text-red-400",
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
