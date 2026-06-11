import { describe, it, expect } from 'vitest';
import { code11CheckDigits } from './barcodeCheckDigits';

// Verified against Labelary (^B1 ^FD..., HRI shows data + check digit(s)).
describe('code11CheckDigits', () => {
  it('computes C+K for "12345" (two=true): C=2, K=8', () => {
    expect(code11CheckDigits('12345', true)).toBe('28');
  });
  it('computes only C for "12345" (two=false): C=2', () => {
    expect(code11CheckDigits('12345', false)).toBe('2');
  });
  it('renders a value-10 check digit as the dash symbol', () => {
    // "123": C = 3*1+2*2+1*3 = 10 -> "-"; K over "123-" = 4.
    expect(code11CheckDigits('123', true)).toBe('-4');
  });
  it('cycles weights past length 10', () => {
    // "12345678901" (e=N): C=4, K=10 -> "-".
    expect(code11CheckDigits('12345678901', true)).toBe('4-');
  });
  it('skips non Code 11 characters instead of producing NaN', () => {
    expect(code11CheckDigits('12A', true)).not.toMatch(/NaN/);
  });
});
