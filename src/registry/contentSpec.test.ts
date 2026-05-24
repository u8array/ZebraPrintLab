import { describe, it, expect } from 'vitest';
import { filterContent, hasValidLength, type ContentSpec } from './contentSpec';

describe('filterContent', () => {
  it('strips characters outside the charset', () => {
    const spec: ContentSpec = { charset: '0-9' };
    expect(filterContent('A1B2C3', spec)).toBe('123');
  });

  it('truncates to maxLength', () => {
    const spec: ContentSpec = { charset: '0-9', maxLength: 3 };
    expect(filterContent('123456789', spec)).toBe('123');
  });

  it('returns raw when no spec', () => {
    expect(filterContent('anything')).toBe('anything');
  });
});

describe('hasValidLength', () => {
  it('returns true when no spec is provided', () => {
    expect(hasValidLength('anything')).toBe(true);
  });

  it('returns true when spec has no validLengths constraint', () => {
    expect(hasValidLength('whatever', { charset: '0-9' })).toBe(true);
  });

  it('returns true for empty content (not yet typed)', () => {
    expect(hasValidLength('', { charset: '0-9', validLengths: [2, 5] })).toBe(true);
  });

  it('returns true when content length matches an allowed value', () => {
    const spec: ContentSpec = { charset: '0-9', validLengths: [2, 5] };
    expect(hasValidLength('42', spec)).toBe(true);
    expect(hasValidLength('12345', spec)).toBe(true);
  });

  it('returns false for in-between lengths (UPC/EAN supplement 1/3/4)', () => {
    const spec: ContentSpec = { charset: '0-9', validLengths: [2, 5] };
    expect(hasValidLength('1', spec)).toBe(false);
    expect(hasValidLength('123', spec)).toBe(false);
    expect(hasValidLength('1234', spec)).toBe(false);
  });
});
