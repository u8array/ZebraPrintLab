import { describe, it, expect } from 'vitest';
import { filterContent, hasValidLength, contentSanitiser, resolveContentSpec, type ContentSpec } from '@zplab/core/registry/contentSpec';

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

describe('contentSanitiser', () => {
  const numeric: ContentSpec = { charset: '0-9' };

  it('filters literal slices to the charset', () => {
    expect(contentSanitiser(numeric)('a1b2c3')).toBe('123');
  });

  it('leaves «name» / «clock:Y» markers intact while filtering around them', () => {
    expect(contentSanitiser(numeric)('x«sku»9a«clock:Y»')).toBe('«sku»9«clock:Y»');
  });

  it('ignores maxLength (length is enforced via the editor)', () => {
    expect(contentSanitiser({ charset: '0-9', maxLength: 2 })('12345')).toBe('12345');
  });

  it('returns the same cached function for one spec', () => {
    expect(contentSanitiser(numeric)).toBe(contentSanitiser(numeric));
  });

  describe('normalize (paste shortcut)', () => {
    // MAGIC stands in for a GS1 element string; its payload may hold chars
    // outside the charset (here '#') which must survive verbatim.
    const spec: ContentSpec = { charset: '0-9', normalize: (raw) => (raw === 'MAGIC' ? '1#2' : null) };

    it('returns the normaliser payload verbatim, not charset-filtered', () => {
      expect(contentSanitiser(spec)('MAGIC')).toBe('1#2');
    });

    it('falls back to charset filtering when the normaliser returns null', () => {
      expect(contentSanitiser(spec)('a1b2')).toBe('12');
    });

    it('skips the normaliser when markers are present (user is editing)', () => {
      expect(contentSanitiser(spec)('MAGIC«v»')).toBe('«v»');
    });
  });
});

describe("resolveContentSpec", () => {
  const spec: ContentSpec = { charset: "0-9" };

  it("returns a static spec unchanged", () => {
    expect(resolveContentSpec(spec, { gs1: true })).toBe(spec);
  });

  it("invokes a function spec against props (DataMatrix GS1 pattern)", () => {
    const fn = (props: object) => ((props as { gs1?: boolean }).gs1 ? spec : undefined);
    expect(resolveContentSpec(fn, { gs1: true })).toBe(spec);
    expect(resolveContentSpec(fn, { gs1: false })).toBeUndefined();
  });

  it("passes through undefined", () => {
    expect(resolveContentSpec(undefined, {})).toBeUndefined();
  });
});
