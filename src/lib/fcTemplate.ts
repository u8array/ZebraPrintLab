// ^FC substitutes RTC into ^FD; clock-char + letter -> «clock:T» marker.
// Preview uses new Date(); printer RTC is authoritative at print time.

const TOKEN_FORMATTERS: Record<string, (d: Date) => string> = {
  Y: (d) => String(d.getFullYear()),
  y: (d) => String(d.getFullYear() % 100).padStart(2, "0"),
  m: (d) => String(d.getMonth() + 1).padStart(2, "0"),
  d: (d) => String(d.getDate()).padStart(2, "0"),
  H: (d) => String(d.getHours()).padStart(2, "0"),
  M: (d) => String(d.getMinutes()).padStart(2, "0"),
  S: (d) => String(d.getSeconds()).padStart(2, "0"),
  j: (d) => {
    // Sum month-lengths locally so DST can't cause off-by-one.
    const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const y = d.getFullYear();
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    let n = d.getDate();
    for (let i = 0; i < d.getMonth(); i++) {
      n += monthDays[i] ?? 0;
      if (i === 1 && leap) n += 1;
    }
    return String(n).padStart(3, "0");
  },
};

/** TS narrowing keeps this in sync with TOKEN_FORMATTERS. */
export const CLOCK_TOKEN_LABELS = [
  { token: "Y", labelKey: "clockYear4" },
  { token: "y", labelKey: "clockYear2" },
  { token: "m", labelKey: "clockMonth" },
  { token: "d", labelKey: "clockDay" },
  { token: "H", labelKey: "clockHour24" },
  { token: "M", labelKey: "clockMinute" },
  { token: "S", labelKey: "clockSecond" },
  { token: "j", labelKey: "clockJulianDay" },
] as const satisfies readonly { token: keyof typeof TOKEN_FORMATTERS; labelKey: string }[];

/** ^FC date/time/tertiary; defaults `% { #`, alt picked on payload clash. */
export interface ClockChars {
  date: string;
  time: string;
  tertiary: string;
}

export const DEFAULT_CLOCK_CHARS: ClockChars = { date: "%", time: "{", tertiary: "#" };

const CLOCK_BODY = /«clock:([A-Za-z])»/;
const clockRe = () => /«clock:([A-Za-z])»/g;

/** True when `content` carries at least one `«clock:T»` marker. */
export function hasClockMarkers(content: string): boolean {
  return CLOCK_BODY.test(content);
}

/** Source order, duplicates preserved (caller dedupes). */
export function extractClockTokens(content: string): string[] {
  return [...content.matchAll(clockRe())]
    .map((m) => m[1])
    .filter((t): t is string => t !== undefined);
}

/** Unknown tokens fall through as literal marker. */
export function resolveClockMarkers(content: string, now: Date): string {
  return content.replace(clockRe(), (full, token: string) => {
    const fmt = TOKEN_FORMATTERS[token];
    return fmt ? fmt(now) : full;
  });
}

/** Only clock-char + known formatter letter is converted; `%foo` stays.
 *  ^SO secondary/tertiary offsets not yet modeled. */
export function tokensToMarkers(payload: string, chars: ClockChars): string {
  // Drop empty chars so ^FC,, doesn't collapse to a `[]` char-class.
  const escaped = [chars.date, chars.time, chars.tertiary]
    .filter((c) => c.length > 0)
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return payload;
  const charClass = `[${escaped.join("")}]`;
  const tokenLetters = Object.keys(TOKEN_FORMATTERS).join("");
  const re = new RegExp(`${charClass}([${tokenLetters}])`, "g");
  return payload.replace(re, (_full, token: string) => `«clock:${token}»`);
}

/** Emits date char only; firmware treats all three as same RTC. */
export function markersToTokens(content: string, dateChar: string): string {
  return content.replace(clockRe(), (full, token: string) => {
    if (!(token in TOKEN_FORMATTERS)) return full;
    return `${dateChar}${token}`;
  });
}

/** Null when any slot exhausts; caller leaves markers literal. */
const DATE_CANDIDATES = ["%", "$", "*", "+", "="] as const;
const TIME_CANDIDATES = ["{", "<", "[", "(", "?"] as const;
const TERT_CANDIDATES = ["#", "@", "|", "&", "!"] as const;

function pickOne(candidates: readonly string[], payloads: readonly string[]): string | null {
  for (const c of candidates) {
    if (payloads.every((p) => !p.includes(c))) return c;
  }
  return null;
}

export function pickClockChars(payloads: readonly string[]): ClockChars | null {
  const date = pickOne(DATE_CANDIDATES, payloads);
  const time = pickOne(TIME_CANDIDATES, payloads);
  const tertiary = pickOne(TERT_CANDIDATES, payloads);
  if (!date || !time || !tertiary) return null;
  return { date, time, tertiary };
}

export function isDefaultClockChars(c: ClockChars): boolean {
  return (
    c.date === DEFAULT_CLOCK_CHARS.date &&
    c.time === DEFAULT_CLOCK_CHARS.time &&
    c.tertiary === DEFAULT_CLOCK_CHARS.tertiary
  );
}
