import { describe, it, expect } from 'vitest';
import { parseIntOrUndef, clampMin } from './inputParse';

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
