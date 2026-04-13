import { describe, it, expect } from 'vitest';
import { mmToUnit, unitToMm } from './units';

describe('mmToUnit — mm', () => {
  it('rounds to 1 decimal place', () => {
    expect(mmToUnit(10, 'mm')).toBe(10);
    expect(mmToUnit(10.15, 'mm')).toBe(10.2);
    expect(mmToUnit(25.4, 'mm')).toBe(25.4);
  });
});

describe('mmToUnit — cm', () => {
  it('divides by 10 and rounds to 2 decimal places', () => {
    expect(mmToUnit(10, 'cm')).toBe(1);
    expect(mmToUnit(25, 'cm')).toBe(2.5);
    expect(mmToUnit(100, 'cm')).toBe(10);
  });
});

describe('mmToUnit — in', () => {
  it('converts 25.4 mm to exactly 1 inch', () => {
    expect(mmToUnit(25.4, 'in')).toBe(1);
  });

  it('converts 0 mm to 0 inches', () => {
    expect(mmToUnit(0, 'in')).toBe(0);
  });
});

describe('unitToMm — mm', () => {
  it('returns the value unchanged', () => {
    expect(unitToMm(10, 'mm')).toBe(10);
    expect(unitToMm(0.5, 'mm')).toBe(0.5);
  });
});

describe('unitToMm — cm', () => {
  it('multiplies by 10', () => {
    expect(unitToMm(1, 'cm')).toBe(10);
    expect(unitToMm(2.5, 'cm')).toBe(25);
  });
});

describe('unitToMm — in', () => {
  it('multiplies by 25.4', () => {
    expect(unitToMm(1, 'in')).toBe(25.4);
    expect(unitToMm(2, 'in')).toBe(50.8);
  });
});

describe('roundtrip mm → unit → mm', () => {
  it('is lossless for mm', () => {
    expect(unitToMm(mmToUnit(50, 'mm'), 'mm')).toBeCloseTo(50, 5);
  });

  it('is lossless for cm', () => {
    expect(unitToMm(mmToUnit(50, 'cm'), 'cm')).toBeCloseTo(50, 5);
  });

  it('is lossless for in (within float precision)', () => {
    expect(unitToMm(mmToUnit(50.8, 'in'), 'in')).toBeCloseTo(50.8, 1);
  });
});
