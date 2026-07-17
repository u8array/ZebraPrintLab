import { describe, it, expect } from 'vitest';
import {
  formatRealtimeClockForZpl,
  parseRealtimeClock,
  realtimeClockIsoRegex,
  toLocalIsoString,
} from '@zplab/core/lib/realtimeClock';

describe('formatRealtimeClockForZpl', () => {
  it('splits a full ISO datetime into MM,DD,YYYY,HH,MM,SS', () => {
    expect(formatRealtimeClockForZpl('2026-05-29T18:30:45')).toBe('05,29,2026,18,30,45');
  });

  it('defaults seconds to 00 when input omits them', () => {
    expect(formatRealtimeClockForZpl('2026-05-29T18:30')).toBe('05,29,2026,18,30,00');
  });

  it('returns null for malformed input', () => {
    expect(formatRealtimeClockForZpl('not-a-date')).toBeNull();
    expect(formatRealtimeClockForZpl('26-05-29T18:30:00')).toBeNull(); // 2-digit year
  });

  it('rejects impossible values (month=13, day=32, hour=25)', () => {
    expect(formatRealtimeClockForZpl('2026-13-01T00:00:00')).toBeNull();
    expect(formatRealtimeClockForZpl('2026-05-32T00:00:00')).toBeNull();
    expect(formatRealtimeClockForZpl('2026-05-01T25:00:00')).toBeNull();
    expect(formatRealtimeClockForZpl('2026-05-01T00:60:00')).toBeNull();
    expect(formatRealtimeClockForZpl('2026-05-01T00:00:60')).toBeNull();
  });

  it('rejects calendar-impossible dates (Feb 30, Apr 31, Feb 29 in non-leap year)', () => {
    expect(formatRealtimeClockForZpl('2026-02-30T00:00:00')).toBeNull();
    expect(formatRealtimeClockForZpl('2026-04-31T00:00:00')).toBeNull();
    expect(formatRealtimeClockForZpl('2026-02-29T00:00:00')).toBeNull(); // 2026 not leap
  });

  it('accepts Feb 29 in leap years', () => {
    expect(formatRealtimeClockForZpl('2024-02-29T00:00:00')).toBe('02,29,2024,00,00,00');
  });
});

describe('parseRealtimeClock', () => {
  it('joins valid params into the ISO local datetime shape', () => {
    expect(parseRealtimeClock(['05', '29', '2026', '18', '30', '45']))
      .toBe('2026-05-29T18:30:45');
  });

  it('zero-pads single-digit positional values', () => {
    expect(parseRealtimeClock(['5', '9', '2026', '8', '3', '0']))
      .toBe('2026-05-09T08:03:00');
  });

  it('returns null when fewer than 6 params are supplied', () => {
    expect(parseRealtimeClock(['05', '29', '2026', '18', '30'])).toBeNull();
  });

  it('rejects impossible values (month=13, day=32, hour=25)', () => {
    expect(parseRealtimeClock(['13', '01', '2026', '00', '00', '00'])).toBeNull();
    expect(parseRealtimeClock(['05', '32', '2026', '00', '00', '00'])).toBeNull();
    expect(parseRealtimeClock(['05', '01', '2026', '25', '00', '00'])).toBeNull();
    expect(parseRealtimeClock(['05', '01', '2026', '00', '60', '00'])).toBeNull();
    expect(parseRealtimeClock(['05', '01', '2026', '00', '00', '99'])).toBeNull();
  });

  it('rejects 2-digit year (firmware requires 4-digit)', () => {
    expect(parseRealtimeClock(['05', '29', '26', '18', '30', '45'])).toBeNull();
  });

  it('rejects calendar-impossible dates (Feb 30, Apr 31, Feb 29 in non-leap year)', () => {
    expect(parseRealtimeClock(['02', '30', '2026', '00', '00', '00'])).toBeNull();
    expect(parseRealtimeClock(['04', '31', '2026', '00', '00', '00'])).toBeNull();
    expect(parseRealtimeClock(['02', '29', '2026', '00', '00', '00'])).toBeNull();
  });

  it('accepts Feb 29 in leap years', () => {
    expect(parseRealtimeClock(['02', '29', '2024', '00', '00', '00'])).toBe('2024-02-29T00:00:00');
  });
});

describe('toLocalIsoString', () => {
  it('formats a Date into YYYY-MM-DDTHH:MM:SS using local time fields', () => {
    // Use the local-field constructor so the test does not depend on
    // the host timezone: `new Date(2026, 4, 30, 18, 30, 45)` is local
    // May 30 2026 18:30:45 regardless of TZ.
    const d = new Date(2026, 4, 30, 18, 30, 45);
    expect(toLocalIsoString(d)).toBe('2026-05-30T18:30:45');
  });

  it('zero-pads single-digit month / day / hour / minute / second', () => {
    const d = new Date(2026, 0, 5, 7, 3, 9);
    expect(toLocalIsoString(d)).toBe('2026-01-05T07:03:09');
  });

  it('output round-trips through formatRealtimeClockForZpl', () => {
    const iso = toLocalIsoString(new Date(2026, 4, 30, 18, 30, 45));
    // Assert the concrete ZPL positional shape (MM,DD,YYYY,HH,MM,SS)
    // so a regression in toLocalIsoString that still parses but
    // produces wrong values would surface here.
    expect(formatRealtimeClockForZpl(iso)).toBe('05,30,2026,18,30,45');
  });

  it('output matches the schema-level shape regex', () => {
    expect(realtimeClockIsoRegex.test(toLocalIsoString(new Date()))).toBe(true);
  });
});

describe('realtimeClockIsoRegex', () => {
  it('accepts both with and without seconds', () => {
    expect(realtimeClockIsoRegex.test('2026-05-29T18:30')).toBe(true);
    expect(realtimeClockIsoRegex.test('2026-05-29T18:30:45')).toBe(true);
  });

  it('rejects shapes that the datetime-local input cannot produce', () => {
    expect(realtimeClockIsoRegex.test('2026-05-29')).toBe(false);
    expect(realtimeClockIsoRegex.test('2026/05/29T18:30')).toBe(false);
    expect(realtimeClockIsoRegex.test('banana')).toBe(false);
  });
});
