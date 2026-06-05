// Round-trip source of truth for ^ST: ISO datetime-local <-> Zebra's
// `MM,DD,YYYY,HH,MM,SS` six positional params with calendar validation.

export { realtimeClockIsoRegex } from '../types/PrinterProfile';

/** Local-time ISO `YYYY-MM-DDTHH:MM:SS`; deterministic on `d` for tests. */
export function toLocalIsoString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const inRangeStr = (s: string, min: number, max: number): boolean => {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= min && n <= max;
};

/** Day 0 of month N = last day of month N-1; leap-year safe. */
const lastDayOfMonth = (year: number, month1Indexed: number): number =>
  new Date(year, month1Indexed, 0).getDate();

const isValidCalendarDate = (year: number, month: number, day: number): boolean =>
  day <= lastDayOfMonth(year, month);

const pad2 = (s: string) => s.padStart(2, '0');

/** Null on any range/calendar violation; parser drops silently. */
export function parseRealtimeClock(params: readonly (string | undefined)[]): string | null {
  if (params.length < 6) return null;
  const mo = (params[0] ?? '').trim();
  const da = (params[1] ?? '').trim();
  const yr = (params[2] ?? '').trim();
  const hr = (params[3] ?? '').trim();
  const mi = (params[4] ?? '').trim();
  const se = (params[5] ?? '').trim();
  if (!/^\d{1,2}$/.test(mo) || !inRangeStr(mo, 1, 12)) return null;
  if (!/^\d{1,2}$/.test(da) || !inRangeStr(da, 1, 31)) return null;
  if (!/^\d{4}$/.test(yr)) return null;
  if (!/^\d{1,2}$/.test(hr) || !inRangeStr(hr, 0, 23)) return null;
  if (!/^\d{1,2}$/.test(mi) || !inRangeStr(mi, 0, 59)) return null;
  if (!/^\d{1,2}$/.test(se) || !inRangeStr(se, 0, 59)) return null;
  if (!isValidCalendarDate(Number.parseInt(yr, 10), Number.parseInt(mo, 10), Number.parseInt(da, 10))) return null;
  return `${yr}-${pad2(mo)}-${pad2(da)}T${pad2(hr)}:${pad2(mi)}:${pad2(se)}`;
}

/** ISO -> `MM,DD,YYYY,HH,MM,SS`; null on malformed/impossible date. */
export function formatRealtimeClockForZpl(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(iso);
  if (!m) return null;
  // `?? ''` dead branches for noUncheckedIndexedAccess.
  const year = m[1] ?? '';
  const month = m[2] ?? '';
  const day = m[3] ?? '';
  const hour = m[4] ?? '';
  const minute = m[5] ?? '';
  const second = m[6] ?? '00';
  if (!inRangeStr(month, 1, 12)) return null;
  if (!inRangeStr(day, 1, 31)) return null;
  if (!inRangeStr(hour, 0, 23)) return null;
  if (!inRangeStr(minute, 0, 59)) return null;
  if (!inRangeStr(second, 0, 59)) return null;
  if (!isValidCalendarDate(Number.parseInt(year, 10), Number.parseInt(month, 10), Number.parseInt(day, 10))) return null;
  return `${month},${day},${year},${hour},${minute},${second}`;
}
