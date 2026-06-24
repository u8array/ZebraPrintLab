import { addableIdsInGroup, withPresetVariants } from './palettePresets';

/** A curated palette type: one symmetric, pre-filled row category. `variants`
 *  are addable-entry ids (registry types and preset ids from palettePresets);
 *  variants[0] is the default. Decoupled from ObjectGroup so image (group
 *  `shape`) is its own row and text/symbol split out of the text group. */
export interface PaletteType {
  /** Stable id; also the locale key under `t.paletteType`. */
  id: string;
  variants: string[];
}

/** Pre-filled rows: each lists its curated base types; presets interleave via
 *  withPresetVariants so their placement lives once in PALETTE_PRESETS. text/shape
 *  curate by hand (split serial/image, reorder); code rows take the registry group. */
export const PALETTE_TYPES: PaletteType[] = [
  { id: 'text', variants: withPresetVariants(['text', 'symbol']) },
  { id: 'shape', variants: withPresetVariants(['line', 'box', 'ellipse']) },
  { id: 'code-1d', variants: addableIdsInGroup('code-1d') },
  { id: 'code-2d', variants: addableIdsInGroup('code-2d') },
  { id: 'code-postal', variants: addableIdsInGroup('code-postal') },
  { id: 'image', variants: withPresetVariants(['image']) },
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
