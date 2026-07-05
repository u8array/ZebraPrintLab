import { describe, it, expect } from 'vitest';
import { defaultPaletteRows } from './paletteTypes';
import { resolveAddable, addablesInGroup, PALETTE_PRESET_IDS } from './palettePresets';
import { PALETTE_GROUPS } from '../components/Palette/paletteGroups';
import en from '../locales/en';

describe('paletteTypes', () => {
  it('defaultPaletteRows are the curated favorites, each resolvable', () => {
    const rows = defaultPaletteRows();
    expect(rows.map((r) => r.entryId)).toEqual(['text', 'box', 'line', 'image', 'code128', 'qrcode']);
    for (const r of rows) expect(resolveAddable(r.entryId, en), r.entryId).not.toBeNull();
    // Row id equals the entry id for defaults (unique + stable for reorder).
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('every preset is reachable via flat browse (no orphan preset)', () => {
    const browseIds = new Set(PALETTE_GROUPS.flatMap((g) => addablesInGroup(g.key, en).map((e) => e.id)));
    for (const id of PALETTE_PRESET_IDS) expect(browseIds.has(id), id).toBe(true);
  });

  it('the GS1 DataMatrix preset follows datamatrix and seeds gs1:true', () => {
    const ids = addablesInGroup('code-2d', en).map((e) => e.id);
    expect(ids[ids.indexOf('datamatrix') + 1]).toBe('datamatrix-gs1');
    // No content seed: an empty GS1 field opens the builder on its use-case
    // presets instead of a sample element string.
    expect(resolveAddable('datamatrix-gs1', en)).toMatchObject({
      type: 'datamatrix',
      propsOverride: { gs1: true },
    });
    expect((resolveAddable('datamatrix-gs1', en)?.propsOverride as { content?: string }).content).toBeUndefined();
  });
});
