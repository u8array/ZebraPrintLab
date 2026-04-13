import { describe, it, expect } from 'vitest';
import { mmToDots, dotsToMm, pxToDots, dotsToPx } from './coordinates';

describe('mmToDots', () => {
  it('converts mm to dots at 8 dpmm', () => {
    expect(mmToDots(1, 8)).toBe(8);
    expect(mmToDots(10, 8)).toBe(80);
  });

  it('converts a common label dimension: 100 mm at 8 dpmm', () => {
    expect(mmToDots(100, 8)).toBe(800);
  });

  it('rounds to the nearest integer', () => {
    // 1.5 mm * 8 dpmm = 12 (exact), 1.55 * 8 = 12.4 → 12
    expect(mmToDots(1.55, 8)).toBe(12);
  });

  it('returns 0 for 0 mm', () => {
    expect(mmToDots(0, 8)).toBe(0);
  });

  it('supports 12 dpmm (300 dpi)', () => {
    expect(mmToDots(25.4, 12)).toBe(305);
  });
});

describe('dotsToMm', () => {
  it('converts dots to mm at 8 dpmm', () => {
    expect(dotsToMm(8, 8)).toBe(1);
    expect(dotsToMm(80, 8)).toBe(10);
  });

  it('rounds to 1 decimal place', () => {
    // 203 / 8 = 25.375 → rounds to 25.4
    expect(dotsToMm(203, 8)).toBe(25.4);
  });

  it('returns 0 for 0 dots', () => {
    expect(dotsToMm(0, 8)).toBe(0);
  });
});

describe('pxToDots', () => {
  it('converts canvas pixels to printer dots', () => {
    // 100 px / scale 2 * dpmm 8 = 400 dots
    expect(pxToDots(100, 2, 8)).toBe(400);
  });

  it('rounds to nearest integer', () => {
    // 101 / 2 * 8 = 404, exact
    expect(pxToDots(101, 2, 8)).toBe(404);
  });
});

describe('dotsToPx', () => {
  it('converts printer dots to canvas pixels', () => {
    // 400 dots / dpmm 8 * scale 2 = 100 px
    expect(dotsToPx(400, 2, 8)).toBe(100);
  });
});

describe('mmToDots / dotsToMm roundtrip', () => {
  it('is lossless for values that are multiples of 1/dpmm', () => {
    const dpmm = 8;
    for (const mm of [10, 25, 50, 100, 150]) {
      expect(dotsToMm(mmToDots(mm, dpmm), dpmm)).toBe(mm);
    }
  });
});
