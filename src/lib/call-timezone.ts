// Tells you whether it's currently inside the 9:30am-5pm Mon-Fri calling window
// for a lead. The phone number's area code is the primary signal (that's the
// office you're actually dialing); the free-text location field is a fallback
// for numbers we can't map (toll-free, non-NANP) and is used to quietly flag
// leads where the two signals disagree.

// NANP geographic area codes -> IANA timezone. Excludes non-geographic codes
// (800/833/844/855/866/877/888 toll-free, 900 premium, 500/700 special).
// A handful of states/provinces have a single area code spanning two
// timezones (FL 850, ID 208, MI 906, NE 308, ND 701, SD 605); these default
// to the zone covering the larger population and fall back to the address
// (via CITY_OVERRIDES) to disambiguate when only the address is known.
const AREA_CODE_TIMEZONE: Record<string, string> = {
  // Eastern
  201: "America/New_York", 202: "America/New_York", 203: "America/New_York", 207: "America/New_York",
  212: "America/New_York", 215: "America/New_York", 216: "America/New_York", 217: "America/Chicago",
  219: "America/Chicago", 220: "America/New_York", 223: "America/New_York", 224: "America/Chicago",
  226: "America/New_York", 229: "America/New_York", 231: "America/New_York", 234: "America/New_York",
  239: "America/New_York", 240: "America/New_York",
  248: "America/New_York", 249: "America/New_York", 252: "America/New_York", 260: "America/New_York",
  540: "America/New_York", 574: "America/New_York", 603: "America/New_York", 631: "America/New_York",
  765: "America/New_York", 865: "America/New_York", 906: "America/New_York",
  262: "America/Chicago", 267: "America/New_York", 269: "America/New_York", 272: "America/New_York",
  276: "America/New_York", 278: "America/New_York", 283: "America/New_York", 289: "America/New_York",
  301: "America/New_York", 302: "America/New_York", 304: "America/New_York", 305: "America/New_York",
  309: "America/Chicago", 313: "America/New_York", 315: "America/New_York", 317: "America/New_York",
  321: "America/New_York", 326: "America/New_York", 330: "America/New_York", 332: "America/New_York",
  334: "America/Chicago", 336: "America/New_York", 339: "America/New_York", 343: "America/New_York",
  347: "America/New_York", 351: "America/New_York", 352: "America/New_York",
  354: "America/New_York", 380: "America/New_York", 386: "America/New_York", 401: "America/New_York",
  404: "America/New_York", 407: "America/New_York", 410: "America/New_York", 412: "America/New_York",
  413: "America/New_York", 414: "America/Chicago", 419: "America/New_York", 423: "America/New_York",
  434: "America/New_York", 437: "America/New_York", 440: "America/New_York", 443: "America/New_York",
  445: "America/New_York", 447: "America/Chicago", 463: "America/New_York", 470: "America/New_York",
  475: "America/New_York", 478: "America/New_York", 484: "America/New_York", 508: "America/New_York",
  513: "America/New_York", 516: "America/New_York", 517: "America/New_York", 518: "America/New_York",
  519: "America/New_York", 551: "America/New_York", 561: "America/New_York", 567: "America/New_York",
  570: "America/New_York", 571: "America/New_York", 585: "America/New_York", 586: "America/New_York",
  595: "America/New_York", 607: "America/New_York", 609: "America/New_York", 610: "America/New_York",
  613: "America/New_York", 614: "America/New_York", 616: "America/New_York", 617: "America/New_York",
  646: "America/New_York", 647: "America/New_York", 649: "America/New_York", 667: "America/New_York",
  678: "America/New_York", 680: "America/New_York", 681: "America/New_York", 689: "America/New_York",
  703: "America/New_York", 704: "America/New_York", 705: "America/New_York", 706: "America/New_York",
  716: "America/New_York", 717: "America/New_York", 718: "America/New_York", 724: "America/New_York",
  727: "America/New_York", 732: "America/New_York", 734: "America/New_York", 740: "America/New_York",
  743: "America/New_York", 754: "America/New_York", 757: "America/New_York", 762: "America/New_York",
  770: "America/New_York", 772: "America/New_York", 774: "America/New_York", 781: "America/New_York",
  786: "America/New_York", 787: "America/New_York",
  802: "America/New_York", 803: "America/New_York", 804: "America/New_York", 810: "America/New_York",
  813: "America/New_York", 814: "America/New_York", 815: "America/Chicago", 828: "America/New_York",
  838: "America/New_York", 839: "America/New_York", 843: "America/New_York", 845: "America/New_York",
  848: "America/New_York", 850: "America/Chicago", 854: "America/New_York", 856: "America/New_York",
  857: "America/New_York", 859: "America/New_York", 860: "America/New_York", 862: "America/New_York",
  863: "America/New_York", 864: "America/New_York", 878: "America/New_York", 904: "America/New_York",
  908: "America/New_York", 910: "America/New_York", 912: "America/New_York", 914: "America/New_York",
  917: "America/New_York", 919: "America/New_York", 929: "America/New_York", 934: "America/New_York",
  936: "America/Chicago", 937: "America/New_York", 941: "America/New_York", 947: "America/New_York",
  954: "America/New_York", 959: "America/New_York", 973: "America/New_York", 978: "America/New_York",
  980: "America/New_York", 984: "America/New_York", 985: "America/Chicago", 989: "America/New_York",
  // Central
  205: "America/Chicago", 210: "America/Chicago", 214: "America/Chicago", 218: "America/Chicago",
  225: "America/Chicago", 228: "America/Chicago", 251: "America/Chicago", 254: "America/Chicago",
  701: "America/Chicago", 737: "America/Chicago",
  256: "America/Chicago", 270: "America/Chicago", 281: "America/Chicago", 306: "America/Chicago",
  308: "America/Chicago", 312: "America/Chicago", 314: "America/Chicago", 316: "America/Chicago",
  318: "America/Chicago", 319: "America/Chicago", 320: "America/Chicago", 325: "America/Chicago",
  331: "America/Chicago", 337: "America/Chicago", 346: "America/Chicago", 360: "America/Los_Angeles",
  361: "America/Chicago", 364: "America/Chicago", 379: "America/Chicago", 402: "America/Chicago",
  405: "America/Chicago", 409: "America/Chicago", 417: "America/Chicago", 430: "America/Chicago",
  431: "America/Chicago", 432: "America/Chicago", 469: "America/Chicago",
  479: "America/Chicago", 501: "America/Chicago", 502: "America/New_York", 504: "America/Chicago",
  507: "America/Chicago", 512: "America/Chicago", 515: "America/Chicago", 531: "America/Chicago",
  534: "America/Chicago", 539: "America/Chicago", 563: "America/Chicago", 573: "America/Chicago",
  580: "America/Chicago", 601: "America/Chicago", 605: "America/Chicago", 608: "America/Chicago",
  612: "America/Chicago", 615: "America/Chicago", 618: "America/Chicago", 620: "America/Chicago",
  629: "America/Chicago", 630: "America/Chicago", 636: "America/Chicago", 641: "America/Chicago",
  651: "America/Chicago", 660: "America/Chicago", 662: "America/Chicago", 682: "America/Chicago",
  708: "America/Chicago", 712: "America/Chicago", 713: "America/Chicago", 715: "America/Chicago",
  731: "America/Chicago", 763: "America/Chicago", 769: "America/Chicago", 773: "America/Chicago",
  779: "America/Chicago", 785: "America/Chicago", 806: "America/Chicago", 812: "America/New_York",
  816: "America/Chicago", 817: "America/Chicago", 830: "America/Chicago", 832: "America/Chicago",
  847: "America/Chicago", 870: "America/Chicago", 872: "America/Chicago", 901: "America/Chicago",
  903: "America/Chicago", 913: "America/Chicago", 915: "America/Denver", 918: "America/Chicago",
  920: "America/Chicago", 924: "America/Chicago", 930: "America/New_York", 931: "America/Chicago",
  940: "America/Chicago", 945: "America/Chicago", 952: "America/Chicago",
  956: "America/Chicago", 972: "America/Chicago", 975: "America/Chicago", 979: "America/Chicago",
  // Mountain
  208: "America/Denver", 303: "America/Denver", 307: "America/Denver", 385: "America/Denver",
  368: "America/Edmonton", 403: "America/Edmonton", 406: "America/Denver", 435: "America/Denver",
  480: "America/Phoenix", 505: "America/Denver", 520: "America/Phoenix", 575: "America/Denver",
  587: "America/Edmonton", 602: "America/Phoenix", 623: "America/Phoenix", 719: "America/Denver",
  720: "America/Denver", 780: "America/Edmonton", 801: "America/Denver", 825: "America/Edmonton",
  928: "America/Phoenix", 970: "America/Denver",
  // Pacific
  206: "America/Los_Angeles", 209: "America/Los_Angeles", 213: "America/Los_Angeles",
  236: "America/Vancouver", 250: "America/Vancouver", 253: "America/Los_Angeles",
  279: "America/Los_Angeles", 310: "America/Los_Angeles", 323: "America/Los_Angeles",
  341: "America/Los_Angeles", 408: "America/Los_Angeles", 415: "America/Los_Angeles",
  424: "America/Los_Angeles", 425: "America/Los_Angeles", 442: "America/Los_Angeles",
  458: "America/Los_Angeles", 503: "America/Los_Angeles", 509: "America/Los_Angeles",
  510: "America/Los_Angeles", 530: "America/Los_Angeles", 541: "America/Los_Angeles",
  559: "America/Los_Angeles", 562: "America/Los_Angeles", 564: "America/Los_Angeles",
  604: "America/Vancouver", 619: "America/Los_Angeles", 626: "America/Los_Angeles",
  628: "America/Los_Angeles", 650: "America/Los_Angeles", 657: "America/Los_Angeles",
  661: "America/Los_Angeles", 669: "America/Los_Angeles", 672: "America/Vancouver",
  702: "America/Los_Angeles", 707: "America/Los_Angeles", 714: "America/Los_Angeles",
  725: "America/Los_Angeles", 747: "America/Los_Angeles", 760: "America/Los_Angeles",
  775: "America/Los_Angeles", 778: "America/Vancouver", 805: "America/Los_Angeles",
  818: "America/Los_Angeles", 820: "America/Los_Angeles", 831: "America/Los_Angeles",
  858: "America/Los_Angeles", 909: "America/Los_Angeles", 916: "America/Los_Angeles",
  925: "America/Los_Angeles", 935: "America/Los_Angeles", 949: "America/Los_Angeles",
  951: "America/Los_Angeles", 971: "America/Los_Angeles",
  // Alaska / Hawaii
  907: "America/Anchorage", 808: "Pacific/Honolulu",
  // Canada (non-Mountain/Pacific — those are grouped above)
  204: "America/Chicago", 416: "America/New_York", 506: "America/Halifax", 905: "America/New_York",
};

function extractAreaCode(phone: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed.startsWith("+1")) return null; // only NANP (+1 US/Canada) numbers carry a usable area code
  const digits = trimmed.replace(/\D/g, "");
  const national = digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  return national.slice(0, 3);
}

function resolveTimezoneFromAreaCode(phone: string | null): string | null {
  const areaCode = extractAreaCode(phone);
  if (!areaCode) return null;
  return AREA_CODE_TIMEZONE[Number(areaCode)] ?? null;
}

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
  "panama city beach, florida": "America/Chicago",
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

const TIMEZONE_LABELS: Record<string, string> = {
  "America/New_York": "Eastern",
  "America/Chicago": "Central",
  "America/Denver": "Mountain",
  "America/Phoenix": "Mountain (Arizona)",
  "America/Los_Angeles": "Pacific",
  "America/Anchorage": "Alaska",
  "Pacific/Honolulu": "Hawaii",
  "America/Vancouver": "Pacific (Canada)",
  "America/Edmonton": "Mountain (Canada)",
  "America/Halifax": "Atlantic (Canada)",
};

export function getTimezoneLabel(timezone: string | null): string {
  if (!timezone) return "Unknown time zone";
  return TIMEZONE_LABELS[timezone] ?? timezone;
}

export type CallStatus = {
  timezone: string | null;
  isOpenNow: boolean;
  localTimeLabel: string; // "2:14 PM" or "" if unknown
  statusLabel: string; // "Open now" | "Opens Mon 9:30 AM" | "Closed until tomorrow" | "Unknown time"
  sortMinutes: number; // minutes until close (if open) or until next open (if closed); Infinity if unknown
};

// Real lead data (from Notion) is "City, State, Country" or "State, Country" —
// the country is always last, not the state. Strip it before reading the state.
const COUNTRY_NOISE = new Set(["united states", "united states of america", "usa", "us"]);

function resolveTimezoneFromAddress(location: string | null): string | null {
  if (!location) return null;
  const raw = location.trim().toLowerCase();
  if (!raw) return null;

  let segments = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  if (segments.length > 1 && COUNTRY_NOISE.has(segments[segments.length - 1])) {
    segments = segments.slice(0, -1);
  }
  while (segments.length > 1 && /^\d{5}(-\d{4})?$/.test(segments[segments.length - 1])) {
    segments = segments.slice(0, -1);
  }

  const statePart = segments[segments.length - 1];
  if (!statePart) return null;

  if (segments.length > 1) {
    const cityStateKey = `${segments[segments.length - 2]}, ${statePart}`;
    if (CITY_OVERRIDES[cityStateKey]) return CITY_OVERRIDES[cityStateKey];
  }

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

export function getCallStatus(location: string | null, phone: string | null, now: Date = new Date()): CallStatus {
  const areaCodeTz = resolveTimezoneFromAreaCode(phone);
  const addressTz = resolveTimezoneFromAddress(location);
  const timezone = areaCodeTz ?? addressTz;

  if (areaCodeTz && addressTz && areaCodeTz !== addressTz) {
    console.warn(
      `[call-timezone] area code and address disagree for phone "${phone}" (${areaCodeTz}) vs location "${location}" (${addressTz}) — using area code.`,
    );
  }

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
