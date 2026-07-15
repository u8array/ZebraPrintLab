// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { ObjectRegistry } from './index';
import { resolveContentSpec, contentSanitiser } from './contentSpec';
import { GS1_DATABAR_EXPANDED_SYMBOLOGIES, GS1_EXPANDED_CHARSET, GS1_GS } from '../lib/gs1';

describe('gs1databar.contentSpec', () => {
  it('restricts non-expanded symbologies to a numeric GTIN', () => {
    for (const symbology of [1, 2, 3, 4, 5]) {
      if (GS1_DATABAR_EXPANDED_SYMBOLOGIES.has(symbology)) continue;
      expect(resolveContentSpec(ObjectRegistry.gs1databar.contentSpec, { symbology })).toEqual({ charset: '0-9' });
    }
  });

  it('expanded converts a pasted GS1 element string to a GS-separated payload', () => {
    const symbology = [...GS1_DATABAR_EXPANDED_SYMBOLOGIES][0]!;
    const spec = resolveContentSpec(ObjectRegistry.gs1databar.contentSpec, { symbology })!;
    expect(spec.charset).toBe(GS1_EXPANDED_CHARSET);
    expect(contentSanitiser(spec)('(01)09501101530003(10)ABC(21)SN')).toBe(
      `010950110153000310ABC${GS1_GS}21SN`,
    );
  });
});
