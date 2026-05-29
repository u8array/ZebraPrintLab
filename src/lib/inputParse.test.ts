import { describe, it, expect } from 'vitest';
import { parseIntOrUndef, clampMin, readBoundedInt, clampBoundedInt } from './inputParse';

describe('parseIntOrUndef', () => {
  it('returns undefined for empty input', () => {
    expect(parseIntOrUndef('')).toBeUndefined();
    expect(parseIntOrUndef('   ')).toBeUndefined();
  });

  it('returns undefined for unparsable input', () => {
    expect(parseIntOrUndef('abc')).toBeUndefined();
  });

  it('parses positive integers', () => {
    expect(parseIntOrUndef('42')).toBe(42);
  });

  it('parses negative integers', () => {
    expect(parseIntOrUndef('-7')).toBe(-7);
  });

  it('preserves 0 as a valid value', () => {
    expect(parseIntOrUndef('0')).toBe(0);
  });

  it('truncates fractional input toward zero', () => {
    expect(parseIntOrUndef('3.7')).toBe(3);
  });
});

describe('clampMin', () => {
  it('returns the parsed value when above min', () => {
    expect(clampMin('5', 1)).toBe(5);
  });

  it('returns min when input is empty', () => {
    expect(clampMin('', 1)).toBe(1);
  });

  it('returns min when input is below the floor', () => {
    expect(clampMin('0', 1)).toBe(1);
    expect(clampMin('-3', 1)).toBe(1);
  });

  it('returns min when input is unparsable', () => {
    expect(clampMin('abc', 1)).toBe(1);
  });

  it('preserves fractional inputs above the floor', () => {
    expect(clampMin('2.5', 1)).toBe(2.5);
  });

  it('respects custom floors other than 1', () => {
    expect(clampMin('5', 10)).toBe(10);
    expect(clampMin('15', 10)).toBe(15);
  });
});

describe('readBoundedInt', () => {
  it('returns undefined for empty / unparsable input', () => {
    expect(readBoundedInt('', 2, 14)).toBeUndefined();
    expect(readBoundedInt('   ', 2, 14)).toBeUndefined();
    expect(readBoundedInt('abc', 2, 14)).toBeUndefined();
  });

  it('lets non-negative sub-min values pass through unchanged (mid-edit)', () => {
    // user typing "12" with min=2: keystroke "1" must survive so
    // the next keystroke can append "2" instead of starting from "2".
    expect(readBoundedInt('1', 2, 14)).toBe(1);
    expect(readBoundedInt('0', 2, 14)).toBe(0);
  });

  it('clamps the upper bound eagerly', () => {
    expect(readBoundedInt('99', 2, 14)).toBe(14);
  });

  it('clamps negative values to min immediately', () => {
    // negative ranges still depend on the user typing "-" first,
    // so subsequent digits never undershoot min via this code path.
    expect(readBoundedInt('-5', 2, 14)).toBe(2);
  });

  it('keeps in-range values intact, including negative ranges', () => {
    expect(readBoundedInt('7', 2, 14)).toBe(7);
    expect(readBoundedInt('-50', -120, 120)).toBe(-50);
    expect(readBoundedInt('-200', -120, 120)).toBe(-120);
    expect(readBoundedInt('300', -120, 120)).toBe(120);
  });
});

describe('clampBoundedInt', () => {
  it('returns undefined for empty / unparsable input', () => {
    expect(clampBoundedInt('', 2, 14)).toBeUndefined();
    expect(clampBoundedInt('abc', 2, 14)).toBeUndefined();
  });

  it('pulls sub-min values back to min (unlike readBoundedInt)', () => {
    expect(clampBoundedInt('1', 2, 14)).toBe(2);
    expect(clampBoundedInt('0', 2, 14)).toBe(2);
  });

  it('caps super-max values to max', () => {
    expect(clampBoundedInt('99', 2, 14)).toBe(14);
  });

  it('leaves in-range values untouched', () => {
    expect(clampBoundedInt('7', 2, 14)).toBe(7);
    expect(clampBoundedInt('-50', -120, 120)).toBe(-50);
  });
});
