import { describe, it, expect } from 'vitest';
import { PALETTE_TYPES, variantsOfType, defaultPaletteRows } from './paletteTypes';
import { resolveAddable, addablesInGroup, PALETTE_PRESET_IDS } from './palettePresets';
import { locales } from '../locales';

const en = locales.en;

describe('paletteTypes', () => {
  it('defaultPaletteRows has one row per type at its first variant', () => {
    const rows = defaultPaletteRows();
    expect(rows.map((r) => r.type)).toEqual(PALETTE_TYPES.map((t) => t.id));
    expect(rows[0]).toMatchObject({ type: 'text', variant: 'text' });
  });

  it('every variant of every type resolves (guards drift vs presets/registry)', () => {
    for (const pt of PALETTE_TYPES)
      for (const v of pt.variants)
        expect(resolveAddable(v, en), `${pt.id}/${v}`).not.toBeNull();
  });

  it('1D expands to many symbologies; unknown type is empty', () => {
    expect(variantsOfType('code-1d').length).toBeGreaterThan(5);
    expect(variantsOfType('unknown')).toEqual([]);
  });

  it('code-2d carries a GS1 DataMatrix preset right after datamatrix that seeds gs1:true', () => {
    const variants = variantsOfType('code-2d');
    expect(variants).toContain('datamatrix');
    expect(variants[variants.indexOf('datamatrix') + 1]).toBe('datamatrix-gs1');
    const entry = resolveAddable('datamatrix-gs1', en);
    expect(entry).toMatchObject({ type: 'datamatrix', propsOverride: { gs1: true, content: '0109501101530003' } });
  });

  it('flat browse and the curated row share one order (no preset drift)', () => {
    for (const group of ['code-1d', 'code-2d', 'code-postal'] as const)
      expect(addablesInGroup(group, en).map((e) => e.id)).toEqual(variantsOfType(group));
  });

  it('text/shape rows interleave their presets after the base type', () => {
    expect(variantsOfType('text')).toEqual(['text', 'text-fb', 'text-tb', 'symbol', 'serial']);
    expect(variantsOfType('shape')).toEqual(['line', 'line-diagonal', 'box', 'box-filled', 'ellipse']);
  });

  it('every preset is reachable in exactly one curated row (no orphan preset)', () => {
    const allVariants = PALETTE_TYPES.flatMap((t) => t.variants);
    for (const id of PALETTE_PRESET_IDS)
      expect(allVariants.filter((v) => v === id), id).toHaveLength(1);
  });
});
