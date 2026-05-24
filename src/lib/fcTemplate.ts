/**
 * `^FC` (Field Clock) tells the printer to substitute its RTC into
 * specific positions of `^FD` field data. The clock chars set via
 * `^FC<a>,<b>,<c>` (defaults `% { #`) act as token prefixes; each
 * clock-char immediately followed by a single action letter becomes
 * a date/time substitution at print time.
 *
 * In our model we represent the substitutions as `«clock:T»` markers
 * — same `«…»` bracket family as the variable markers, dispatched
 * by the `clock:` prefix at resolve time. Stays inside the marker
 * vocabulary the canvas already understands.
 *
 * Render-time preview pulls from `new Date()` so the canvas shows
 * what the printer would substitute right now. The print-time value
 * is the printer's RTC, not ours — they may drift; the editor's job
 * is only to communicate the *shape* of the substitution.
 */

/** Subset of strftime-ish tokens Zebra firmware recognises after a
 *  clock char. Lowercase keys; resolver maps each to a current-date
 *  formatter. Extend as Zebra spec coverage grows; unknown tokens
 *  stay literal in both directions. */
const TOKEN_FORMATTERS: Record<string, (d: Date) => string> = {
  Y: (d) => String(d.getFullYear()),
  y: (d) => String(d.getFullYear() % 100).padStart(2, "0"),
  m: (d) => String(d.getMonth() + 1).padStart(2, "0"),
  d: (d) => String(d.getDate()).padStart(2, "0"),
  H: (d) => String(d.getHours()).padStart(2, "0"),
  M: (d) => String(d.getMinutes()).padStart(2, "0"),
  S: (d) => String(d.getSeconds()).padStart(2, "0"),
  j: (d) => {
    // Sum month-lengths in local time so DST transitions can't cause
    // an off-by-one mid-spring/fall — `(d - jan0) / 86400000` would
    // be 23 or 25 hours short of an integer day on the transition.
    const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const y = d.getFullYear();
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    let n = d.getDate();
    for (let i = 0; i < d.getMonth(); i++) {
      n += monthDays[i]!;
      if (i === 1 && leap) n += 1;
    }
    return String(n).padStart(3, "0");
  },
};

/** Token letters this module understands, paired with the flat
 *  locale key (`t.app.<key>`) the UI's token-picker uses for the
 *  human-readable label. Exported here so the picker stays in lock-
 *  step with the formatters — adding a new TOKEN_FORMATTERS entry
 *  requires a matching CLOCK_TOKEN_LABELS row (TS narrowing forces
 *  it), which in turn requires a locale-key add. */
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

/** ZPL `^FC` clock chars — primary (date), secondary (time), tertiary.
 *  Zebra defaults are `% { #`. Our generator picks an alt triple when
 *  any default clashes with literal payload text. */
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

/** Return every clock token letter referenced in `content`, in source
 *  order with duplicates preserved (caller dedupes). */
export function extractClockTokens(content: string): string[] {
  return [...content.matchAll(clockRe())]
    .map((m) => m[1])
    .filter((t): t is string => t !== undefined);
}

/** Replace every `«clock:T»` marker with the current-date formatter's
 *  output. Unknown tokens fall through as the literal marker text so
 *  the user sees what didn't resolve. */
export function resolveClockMarkers(content: string, now: Date): string {
  return content.replace(clockRe(), (full, token: string) => {
    const fmt = TOKEN_FORMATTERS[token];
    return fmt ? fmt(now) : full;
  });
}

/**
 * Convert a ZPL `^FD` payload containing clock tokens (e.g. `%d/%m/%Y`)
 * into our `«clock:T»` marker form. Only sequences where the clock
 * char is immediately followed by a known TOKEN_FORMATTERS letter are
 * converted — literals like `%foo` stay untouched.
 *
 * `chars` is whatever the most recent `^FC` set; the three chars are
 * checked in order so an alternate set like `^FC@,!,~` works the same
 * as defaults. Currently treats all three chars equivalently; Zebra's
 * docs distinguish primary/secondary/tertiary for which RTC field they
 * draw from, but in practice all behave as "the printer's now" so a
 * single dispatch table is enough.
 */
export function tokensToMarkers(payload: string, chars: ClockChars): string {
  // Defensive: drop empty / invalid chars so a `^FC,,` (all empty)
  // doesn't collapse to a `[]` char-class that silently matches
  // nothing. Valid input always yields three non-empty chars; this
  // guard catches malformed callers (hand-edited state, future
  // refactors) without crashing.
  const escaped = [chars.date, chars.time, chars.tertiary]
    .filter((c) => c.length > 0)
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return payload;
  const charClass = `[${escaped.join("")}]`;
  const tokenLetters = Object.keys(TOKEN_FORMATTERS).join("");
  const re = new RegExp(`${charClass}([${tokenLetters}])`, "g");
  return payload.replace(re, (_full, token: string) => `«clock:${token}»`);
}

/**
 * Convert our `«clock:T»` markers back to the ZPL clock-char + letter
 * sequences. Takes only the date char (not the full ClockChars) —
 * Zebra firmware treats all three clock chars as the same RTC, so we
 * emit the date char for every marker. Signature reflects that.
 */
export function markersToTokens(content: string, dateChar: string): string {
  return content.replace(clockRe(), (full, token: string) => {
    if (!(token in TOKEN_FORMATTERS)) return full;
    return `${dateChar}${token}`;
  });
}

/**
 * Pick a clock-char triple that doesn't clash with any literal payload
 * text. Default `% { #` is preferred (matches ZPL's own default and
 * needs no `^FC` directive). Each char is chosen independently from a
 * ranked candidate list; returns `null` when every candidate for any
 * slot clashes — caller should leave clock markers literal in the
 * output to avoid producing ambiguous ZPL.
 */
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

/** True when the supplied chars equal Zebra defaults, in which case
 *  no `^FC` directive is needed. */
export function isDefaultClockChars(c: ClockChars): boolean {
  return (
    c.date === DEFAULT_CLOCK_CHARS.date &&
    c.time === DEFAULT_CLOCK_CHARS.time &&
    c.tertiary === DEFAULT_CLOCK_CHARS.tertiary
  );
}
