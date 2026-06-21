// Client-side regex parser for follow-up dates inside call notes.
// Returns the SAME shape as the AI parser so call sites are interchangeable.

export type FollowUpParse = {
  found: boolean;
  date: string | null;       // YYYY-MM-DD
  snippet: string | null;    // phrase from the note that matched
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function pad(n: number) { return String(n).padStart(2, "0"); }
function fmt(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fromISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

export function parseFollowUpRegex(text: string, todayISO: string): FollowUpParse {
  if (!text || text.trim().length < 3) return { found: false, date: null, snippet: null };
  const t = text.toLowerCase();
  const today = fromISO(todayISO);
  const todayDow = today.getDay();

  const make = (d: Date, snippet: string): FollowUpParse =>
    ({ found: true, date: fmt(d), snippet });

  // Explicit ISO date YYYY-MM-DD
  const isoMatch = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    if (!isNaN(d.getTime())) return make(d, isoMatch[0]);
  }

  // tomorrow / today
  if (/\btomorrow\b/.test(t)) return make(addDays(today, 1), "tomorrow");
  if (/\btoday\b/.test(t)) return make(today, "today");

  // "in N day/week/month(s)"
  const inN = t.match(/\bin\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(day|days|week|weeks|month|months)\b/);
  if (inN) {
    const wordMap: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const n = wordMap[inN[1]] ?? Number(inN[1]);
    const unit = inN[2];
    const days = unit.startsWith("day") ? n : unit.startsWith("week") ? n * 7 : n * 30;
    return make(addDays(today, days), inN[0]);
  }

  // "next week" / "next month"
  if (/\bnext\s+week\b/.test(t)) return make(addDays(today, 7), "next week");
  if (/\bnext\s+month\b/.test(t)) return make(addDays(today, 30), "next month");

  // weekday: "(call|reach|follow up|try|again) ... (next|this)? <weekday>" or just "<weekday>"
  const dowMatch = t.match(/\b(next|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (dowMatch) {
    const mod = dowMatch[1] ?? "";
    const target = WEEKDAYS.indexOf(dowMatch[2]);
    let diff = (target - todayDow + 7) % 7;
    if (diff === 0) diff = 7;                     // "monday" with today=Mon → next Mon
    if (mod === "next") diff = diff <= 7 ? diff + (diff < 7 ? 7 : 0) : diff;
    return make(addDays(today, diff), dowMatch[0].trim());
  }

  // "Dec 15", "December 15", "15 Dec"
  const monthDay = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/);
  if (monthDay) {
    const m = MONTH_ABBR[monthDay[1]];
    const day = Number(monthDay[2]);
    if (m !== undefined && day >= 1 && day <= 31) {
      let year = today.getFullYear();
      let d = new Date(year, m, day);
      if (d < today) d = new Date(year + 1, m, day);
      return make(d, monthDay[0]);
    }
  }
  const dayMonth = t.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/);
  if (dayMonth) {
    const m = MONTH_ABBR[dayMonth[2]];
    const day = Number(dayMonth[1]);
    if (m !== undefined && day >= 1 && day <= 31) {
      let year = today.getFullYear();
      let d = new Date(year, m, day);
      if (d < today) d = new Date(year + 1, m, day);
      return make(d, dayMonth[0]);
    }
  }

  // M/D or M/D/YY
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const m = Number(slash[1]) - 1;
    const day = Number(slash[2]);
    let year = today.getFullYear();
    if (slash[3]) {
      year = Number(slash[3]);
      if (year < 100) year += 2000;
    }
    if (m >= 0 && m <= 11 && day >= 1 && day <= 31) {
      let d = new Date(year, m, day);
      if (!slash[3] && d < today) d = new Date(year + 1, m, day);
      return make(d, slash[0]);
    }
  }

  return { found: false, date: null, snippet: null };
}

// Used to silence unused-import lint if MONTHS list is dropped later.
export const __monthsRef = MONTHS;
