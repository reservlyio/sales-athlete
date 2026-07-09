// Maps a lead's free-text "City, State" location to a US timezone and tells you
// whether it's currently inside the 9:30am-5pm Mon-Fri calling window there.

const STATE_TIMEZONE: Record<string, string> = {
  alabama: "America/Chicago",
  alaska: "America/Anchorage",
  arizona: "America/Phoenix",
  arkansas: "America/Chicago",
  california: "America/Los_Angeles",
  colorado: "America/Denver",
  connecticut: "America/New_York",
  delaware: "America/New_York",
  florida: "America/New_York",
  georgia: "America/New_York",
  hawaii: "Pacific/Honolulu",
  idaho: "America/Denver",
  illinois: "America/Chicago",
  indiana: "America/New_York",
  iowa: "America/Chicago",
  kansas: "America/Chicago",
  kentucky: "America/New_York",
  louisiana: "America/Chicago",
  maine: "America/New_York",
  maryland: "America/New_York",
  massachusetts: "America/New_York",
  michigan: "America/New_York",
  minnesota: "America/Chicago",
  mississippi: "America/Chicago",
  missouri: "America/Chicago",
  montana: "America/Denver",
  nebraska: "America/Chicago",
  nevada: "America/Los_Angeles",
  "new hampshire": "America/New_York",
  "new jersey": "America/New_York",
  "new mexico": "America/Denver",
  "new york": "America/New_York",
  "north carolina": "America/New_York",
  "north dakota": "America/Chicago",
  ohio: "America/New_York",
  oklahoma: "America/Chicago",
  oregon: "America/Los_Angeles",
  pennsylvania: "America/New_York",
  "rhode island": "America/New_York",
  "south carolina": "America/New_York",
  "south dakota": "America/Chicago",
  tennessee: "America/Chicago",
  texas: "America/Chicago",
  utah: "America/Denver",
  vermont: "America/New_York",
  virginia: "America/New_York",
  washington: "America/Los_Angeles",
  "west virginia": "America/New_York",
  wisconsin: "America/Chicago",
  wyoming: "America/Denver",
  "district of columbia": "America/New_York",
};

const STATE_ABBR_TIMEZONE: Record<string, string> = {
  al: "America/Chicago", ak: "America/Anchorage", az: "America/Phoenix", ar: "America/Chicago",
  ca: "America/Los_Angeles", co: "America/Denver", ct: "America/New_York", de: "America/New_York",
  fl: "America/New_York", ga: "America/New_York", hi: "Pacific/Honolulu", id: "America/Denver",
  il: "America/Chicago", in: "America/New_York", ia: "America/Chicago", ks: "America/Chicago",
  ky: "America/New_York", la: "America/Chicago", me: "America/New_York", md: "America/New_York",
  ma: "America/New_York", mi: "America/New_York", mn: "America/Chicago", ms: "America/Chicago",
  mo: "America/Chicago", mt: "America/Denver", ne: "America/Chicago", nv: "America/Los_Angeles",
  nh: "America/New_York", nj: "America/New_York", nm: "America/Denver", ny: "America/New_York",
  nc: "America/New_York", nd: "America/Chicago", oh: "America/New_York", ok: "America/Chicago",
  or: "America/Los_Angeles", pa: "America/New_York", ri: "America/New_York", sc: "America/New_York",
  sd: "America/Chicago", tn: "America/Chicago", tx: "America/Chicago", ut: "America/Denver",
  vt: "America/New_York", va: "America/New_York", wa: "America/Los_Angeles", wv: "America/New_York",
  wi: "America/Chicago", wy: "America/Denver", dc: "America/New_York",
};

// Known exceptions: cities whose real timezone differs from their state's default
// (states that straddle two US timezones).
const CITY_OVERRIDES: Record<string, string> = {
  "el paso, texas": "America/Denver",
  "el paso, tx": "America/Denver",
  "amarillo, texas": "America/Chicago",
  "pensacola, florida": "America/Chicago",
  "panama city, florida": "America/Chicago",
  "fort walton beach, florida": "America/Chicago",
  "destin, florida": "America/Chicago",
  "gary, indiana": "America/Chicago",
  "hammond, indiana": "America/Chicago",
  "evansville, indiana": "America/Chicago",
  "paducah, kentucky": "America/Chicago",
  "bowling green, kentucky": "America/Chicago",
  "owensboro, kentucky": "America/Chicago",
  "hopkinsville, kentucky": "America/Chicago",
  "knoxville, tennessee": "America/New_York",
  "chattanooga, tennessee": "America/New_York",
  "bristol, tennessee": "America/New_York",
  "johnson city, tennessee": "America/New_York",
  "kingsport, tennessee": "America/New_York",
  "dickinson, north dakota": "America/Denver",
  "williston, north dakota": "America/Denver",
  "rapid city, south dakota": "America/Denver",
  "scottsbluff, nebraska": "America/Denver",
  "boise, idaho": "America/Denver",
  "idaho falls, idaho": "America/Denver",
  "pocatello, idaho": "America/Denver",
  "twin falls, idaho": "America/Denver",
  "coeur d'alene, idaho": "America/Los_Angeles",
  "sandpoint, idaho": "America/Los_Angeles",
  "lewiston, idaho": "America/Los_Angeles",
  "ontario, oregon": "America/Denver",
};

// Idaho's default in STATE_TIMEZONE is Mountain (most of the population), so no
// state-level change needed beyond the panhandle-city overrides above.

export type CallStatus = {
  timezone: string | null;
  isOpenNow: boolean;
  localTimeLabel: string; // "2:14 PM" or "" if unknown
  statusLabel: string; // "Open now" | "Opens Mon 9:30 AM" | "Closed until tomorrow" | "Unknown time"
  sortMinutes: number; // minutes until close (if open) or until next open (if closed); Infinity if unknown
};

function resolveTimezone(location: string | null): string | null {
  if (!location) return null;
  const raw = location.trim().toLowerCase();
  if (!raw) return null;

  if (CITY_OVERRIDES[raw]) return CITY_OVERRIDES[raw];

  const parts = raw.split(",").map((p) => p.trim());
  const statePart = parts[parts.length - 1];
  if (!statePart) return null;

  if (STATE_TIMEZONE[statePart]) return STATE_TIMEZONE[statePart];
  if (statePart.length === 2 && STATE_ABBR_TIMEZONE[statePart]) return STATE_ABBR_TIMEZONE[statePart];

  return null;
}

function getPartsInZone(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday"); // "Mon", "Tue", ...
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  return { weekday, hour, minute };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const OPEN_HOUR = 9;
const OPEN_MINUTE = 30;
const CLOSE_HOUR = 17;
const CLOSE_MINUTE = 0;

export function getCallStatus(location: string | null, now: Date = new Date()): CallStatus {
  const timezone = resolveTimezone(location);
  if (!timezone) {
    return { timezone: null, isOpenNow: false, localTimeLabel: "", statusLabel: "Unknown time", sortMinutes: Infinity };
  }

  const { weekday, hour, minute } = getPartsInZone(now, timezone);
  const localTimeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  const dayIdx = WEEKDAYS.indexOf(weekday);
  const isWeekday = dayIdx >= 1 && dayIdx <= 5;
  const minutesNow = hour * 60 + minute;
  const openMinutes = OPEN_HOUR * 60 + OPEN_MINUTE;
  const closeMinutes = CLOSE_HOUR * 60 + CLOSE_MINUTE;
  const isOpenNow = isWeekday && minutesNow >= openMinutes && minutesNow < closeMinutes;

  if (isOpenNow) {
    return {
      timezone,
      isOpenNow: true,
      localTimeLabel,
      statusLabel: "Open now",
      sortMinutes: closeMinutes - minutesNow,
    };
  }

  // Find minutes until next open moment (next weekday, 9:30 AM local).
  let daysAhead = 0;
  let candidateDay = dayIdx;
  let minutesUntilOpen: number;

  if (isWeekday && minutesNow < openMinutes) {
    minutesUntilOpen = openMinutes - minutesNow;
  } else {
    // Advance to the next weekday (Mon-Fri).
    do {
      daysAhead += 1;
      candidateDay = (dayIdx + daysAhead) % 7;
    } while (candidateDay < 1 || candidateDay > 5);
    minutesUntilOpen = daysAhead * 24 * 60 + openMinutes - minutesNow;
  }

  const label =
    daysAhead === 0
      ? `Opens ${formatMinutesFromNow(minutesUntilOpen)}`
      : daysAhead === 1 && WEEKDAYS[candidateDay] !== "Mon"
        ? `Opens tomorrow 9:30 AM`
        : `Opens ${WEEKDAYS[candidateDay]} 9:30 AM`;

  return {
    timezone,
    isOpenNow: false,
    localTimeLabel,
    statusLabel: label,
    sortMinutes: 1_000_000 + minutesUntilOpen, // always sorts after every open lead
  };
}

function formatMinutesFromNow(mins: number): string {
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
}
