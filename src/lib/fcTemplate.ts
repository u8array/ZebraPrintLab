// ^FC substitutes RTC into ^FD; clock-char + letter -> «clock:T» (primary),
// «clock2:T» (secondary, ^SO2 offset), «clock3:T» (tertiary, ^SO3 offset).
// Preview uses new Date(); printer RTC is authoritative at print time.
import { applyClockOffset, type ClockOffset } from "../types/LabelConfig";

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

/** 1 = primary (no offset), 2 = secondary (^SO2), 3 = tertiary (^SO3). */
export type ClockChannel = 1 | 2 | 3;

/** ^FC date/time/tertiary; defaults `% { #`, alt picked on payload clash. */
export interface ClockChars {
  date: string;
  time: string;
  tertiary: string;
}

export const DEFAULT_CLOCK_CHARS: ClockChars = { date: "%", time: "{", tertiary: "#" };

/** Per-channel Date used at resolve time; secondary/tertiary already
 *  carry the ^SO offset applied. */
export interface ChannelDates {
  primary: Date;
  secondary: Date;
  tertiary: Date;
}

const CLOCK_BODY = /«clock([23]?):([A-Za-z])»/;
const clockRe = () => /«clock([23]?):([A-Za-z])»/g;

function channelOf(suffix: string | undefined): ClockChannel {
  return suffix === "2" ? 2 : suffix === "3" ? 3 : 1;
}

function dateForChannel(dates: ChannelDates, channel: ClockChannel): Date {
  return channel === 2 ? dates.secondary : channel === 3 ? dates.tertiary : dates.primary;
}

function charForChannel(chars: ClockChars, channel: ClockChannel): string {
  return channel === 2 ? chars.time : channel === 3 ? chars.tertiary : chars.date;
}

/** True when `content` carries at least one clock marker (any channel). */
export function hasClockMarkers(content: string): boolean {
  return CLOCK_BODY.test(content);
}

/** Source order, duplicates preserved (caller dedupes). */
export function extractClockTokens(
  content: string,
): { token: string; channel: ClockChannel }[] {
  return [...content.matchAll(clockRe())]
    .map((m) => ({ token: m[2] ?? "", channel: channelOf(m[1]) }))
    .filter((x) => x.token !== "");
}

/** Unknown tokens fall through as literal marker. */
export function resolveClockMarkers(content: string, dates: ChannelDates): string {
  return content.replace(clockRe(), (full, suffix: string, token: string) => {
    const fmt = TOKEN_FORMATTERS[token];
    if (!fmt) return full;
    return fmt(dateForChannel(dates, channelOf(suffix)));
  });
}

/** Build the ChannelDates triple from a primary Date and the two
 *  optional offsets (label-level ^SO2/^SO3). When an offset is absent
 *  the channel falls back to the primary Date so unconfigured
 *  secondary/tertiary markers resolve identically to primary. */
export function channelDatesFrom(
  primary: Date,
  secondaryOffset: ClockOffset | undefined,
  tertiaryOffset: ClockOffset | undefined,
): ChannelDates {
  return {
    primary,
    secondary: applyClockOffset(primary, secondaryOffset),
    tertiary: applyClockOffset(primary, tertiaryOffset),
  };
}

/** Only clock-char + known formatter letter converted; `%foo` stays.
 *  Date char emits `«clock:T»` (primary), time/tertiary chars emit
 *  `«clock2:T»` / `«clock3:T»` so the channel survives round-trip. */
export function tokensToMarkers(payload: string, chars: ClockChars): string {
  const tokenLetters = Object.keys(TOKEN_FORMATTERS).join("");
  const reFor = (c: string) =>
    new RegExp(
      `${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([${tokenLetters}])`,
      "g",
    );
  let out = payload;
  if (chars.date) out = out.replace(reFor(chars.date), (_f, t: string) => `«clock:${t}»`);
  if (chars.time) out = out.replace(reFor(chars.time), (_f, t: string) => `«clock2:${t}»`);
  if (chars.tertiary) out = out.replace(reFor(chars.tertiary), (_f, t: string) => `«clock3:${t}»`);
  return out;
}

/** Emits the per-channel clock char so the channel survives the
 *  round-trip; primary uses chars.date, secondary chars.time,
 *  tertiary chars.tertiary. */
export function markersToTokens(content: string, chars: ClockChars): string {
  return content.replace(clockRe(), (full, suffix: string, token: string) => {
    if (!(token in TOKEN_FORMATTERS)) return full;
    return `${charForChannel(chars, channelOf(suffix))}${token}`;
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
