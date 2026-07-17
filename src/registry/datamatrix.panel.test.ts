// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { ObjectRegistry } from '@zplab/core/registry/index';
import { resolveContentSpec, contentSanitiser } from '@zplab/core/registry/contentSpec';
import { GS1_EXPANDED_CHARSET, GS1_GS } from '@zplab/core/lib/gs1';

describe('datamatrix.contentSpec', () => {
  it('plain (non-GS1) mode stays unfiltered', () => {
    expect(resolveContentSpec(ObjectRegistry.datamatrix.contentSpec, { gs1: false })).toBeUndefined();
  });

  it('GS1 mode uses the GS1 charset and converts a pasted element string', () => {
    const spec = resolveContentSpec(ObjectRegistry.datamatrix.contentSpec, { gs1: true })!;
    expect(spec.charset).toBe(GS1_EXPANDED_CHARSET);
    expect(contentSanitiser(spec)('(01)09501101530003(10)ABC(21)SN')).toBe(
      `010950110153000310ABC${GS1_GS}21SN`,
    );
  });
});
