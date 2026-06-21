export const CALL_RESULTS = [
  "No Answer",
  "Voicemail",
  "Transferred",
  "Meeting Booked",
  "Objection/Not Interested",
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
  new_lead: "bg-muted text-muted-foreground",
  contacted: "bg-accent text-accent-foreground",
  follow_up: "bg-warning/20 text-warning",
  meeting_booked: "bg-primary/20 text-primary",
  client: "bg-success/30 text-success",
  lost: "bg-destructive/20 text-destructive",
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
