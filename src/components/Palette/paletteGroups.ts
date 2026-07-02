import type { ObjectGroup } from '../../types/LabelObject';
import { addablesInGroup, type AddableEntry } from '../../registry/palettePresets';
import type { Translations } from '../../locales';

export const PALETTE_GROUPS = [
  { key: 'text' as ObjectGroup, labelKey: 'groupText' },
  { key: 'code-1d' as ObjectGroup, labelKey: 'groupCode1d' },
  { key: 'code-2d' as ObjectGroup, labelKey: 'groupCode2d' },
  { key: 'code-postal' as ObjectGroup, labelKey: 'groupCodePostal' },
  { key: 'shape' as ObjectGroup, labelKey: 'groupShapes' },
] as const;

export type PaletteGroupLabelKey = typeof PALETTE_GROUPS[number]['labelKey'];

/** Single source for the palette groups; each consumer maps entries onto its
 *  own shape (flat browse, canvas add-here, favorites add). */
export function addableGroupsFor(
  t: Translations,
): { key: ObjectGroup; label: string; entries: AddableEntry[] }[] {
  return PALETTE_GROUPS.map((g) => ({
    key: g.key,
    label: t.palette[g.labelKey],
    entries: addablesInGroup(g.key, t),
  }));
}
