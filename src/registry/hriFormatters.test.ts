import { describe, it, expect } from 'vitest';
import {
  formatEan13Hri,
  formatEan8Hri,
  formatUpcaHri,
  formatUpceHri,
  formatCode39Hri,
  formatLogmarsHri,
  formatUpcEanExtensionHri,
} from './hriFormatters';

describe('HRI formatters', () => {
  describe('formatEan13Hri', () => {
    it('appends check digit to 12-digit input', () => {
      expect(formatEan13Hri('590123412345')).toBe('5901234123457');
    });
    it('pads short input with zeros before computing check digit', () => {
      // "123" padded to "123000000000" → sum=1*1+2*3+3*1=10 → check=0
      expect(formatEan13Hri('123')).toBe('1230000000000');
    });
    it('strips non-digits', () => {
      expect(formatEan13Hri('5-9-0-1-2-3-4-1-2-3-4-5')).toBe('5901234123457');
    });
  });

  describe('formatEan8Hri', () => {
    it('appends check digit to 7-digit input', () => {
      expect(formatEan8Hri('1234567')).toBe('12345670');
    });
  });

  describe('formatUpcaHri', () => {
    it('appends check digit to 11-digit input', () => {
      expect(formatUpcaHri('01234567890')).toBe('012345678905');
    });
  });

  describe('formatUpceHri', () => {
    it('produces 8-char string: 0 + 6 data + check', () => {
      const r = formatUpceHri('012345');
      expect(r).toHaveLength(8);
      expect(r[0]).toBe('0');
      expect(r.slice(1, 7)).toBe('012345');
    });
  });

  describe('formatCode39Hri', () => {
    it('wraps content with start/stop asterisks', () => {
      expect(formatCode39Hri('CODE39')).toBe('*CODE39*');
    });
  });

  describe('formatLogmarsHri', () => {
    it('appends mod-43 check char for plain text', () => {
      // sum("LOGMARS1") in the charset: L=21,O=24,G=16,M=22,A=10,R=27,S=28,1=1
      // = 21+24+16+22+10+27+28+1 = 149 → 149 % 43 = 20 → "K"
      expect(formatLogmarsHri('LOGMARS1')).toBe('LOGMARS1K');
    });
    it('treats lowercase as uppercase (charset is upper-only)', () => {
      expect(formatLogmarsHri('logmars1')).toBe('logmars1K');
    });
    it('ignores characters not in the LOGMARS charset', () => {
      // The single valid char 'A' (index 10) sums to 10 → check = "A".
      // The '@' contributes nothing.
      expect(formatLogmarsHri('A@')).toBe('A@A');
    });
    it('returns empty-content + first-charset-char on empty input', () => {
      expect(formatLogmarsHri('')).toBe('0');
    });
  });

  describe('formatUpcEanExtensionHri', () => {
    it('keeps 2-digit content as-is', () => {
      expect(formatUpcEanExtensionHri('12')).toBe('12');
    });
    it('pads short 5-digit form with zeros', () => {
      expect(formatUpcEanExtensionHri('51')).toBe('51');
      expect(formatUpcEanExtensionHri('519')).toBe('51900');
    });
    it('preserves 5-digit content', () => {
      expect(formatUpcEanExtensionHri('51999')).toBe('51999');
    });
    it('strips non-digits then routes by length', () => {
      expect(formatUpcEanExtensionHri('5-1-9-9-9')).toBe('51999');
    });
  });
});
