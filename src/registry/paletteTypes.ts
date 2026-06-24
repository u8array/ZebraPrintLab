import { ObjectRegistry } from './index';
import type { ObjectGroup } from '../types/LabelObject';

/** A curated palette type: one symmetric, pre-filled row category. `variants`
 *  are addable-entry ids (registry types and preset ids from palettePresets);
 *  variants[0] is the default. Decoupled from ObjectGroup so image (group
 *  `shape`) is its own row and text/symbol split out of the text group. */
export interface PaletteType {
  /** Stable id; also the locale key under `t.paletteType`. */
  id: string;
  variants: string[];
}

/** Registry type ids in a group, in registry order. */
function groupTypes(group: ObjectGroup): string[] {
  return Object.entries(ObjectRegistry)
    .filter(([, def]) => def.group === group)
    .map(([type]) => type);
}

/** The pre-filled type list. 1D/2D/postal expand to every symbology in their
 *  group; text/shape carry their mode/shape presets (diagonal, filled, ^FB/^TB).
 *  Preset ids must match palettePresets; resolveAddable returns null otherwise,
 *  which the paletteTypes test guards against. */
export const PALETTE_TYPES: PaletteType[] = [
  { id: 'text', variants: ['text', 'text-fb', 'text-tb', 'symbol', 'text-serial'] },
  { id: 'shape', variants: ['line', 'line-diagonal', 'box', 'box-filled', 'ellipse'] },
  { id: 'code-1d', variants: groupTypes('code-1d') },
  { id: 'code-2d', variants: groupTypes('code-2d').flatMap((t) => (t === 'datamatrix' ? [t, 'datamatrix-gs1'] : [t])) },
  { id: 'code-postal', variants: groupTypes('code-postal') },
  { id: 'image', variants: ['image'] },
];

const TYPE_BY_ID = new Map(PALETTE_TYPES.map((t) => [t.id, t]));

/** Variant ids for a curated type, or [] if unknown. */
export function variantsOfType(typeId: string): string[] {
  return TYPE_BY_ID.get(typeId)?.variants ?? [];
}

/** Pre-filled default rows: every type at its default (first) variant. The
 *  palette is never empty for new users. Default ids equal the type (unique
 *  across defaults); added rows get a generated id so duplicates stay distinct
 *  and drag-reorder has a stable key. */
export function defaultPaletteRows(): { id: string; type: string; variant: string }[] {
  return PALETTE_TYPES.flatMap((t) => {
    const variant = t.variants[0];
    return variant ? [{ id: t.id, type: t.id, variant }] : [];
  });
}
