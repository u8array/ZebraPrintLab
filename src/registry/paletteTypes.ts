/** Default favorites so a new user's palette is never empty: one common object
 *  per category, plain registry types (no presets). */
const DEFAULT_FAVORITE_ENTRY_IDS = ['text', 'box', 'line', 'image', 'code128', 'qrcode'] as const;

/** Pre-filled favorites rows; the row `id` equals the entry id for defaults
 *  (unique + stable for drag-reorder), while toggled-in rows get a generated id. */
export function defaultPaletteRows(): { id: string; entryId: string }[] {
  return DEFAULT_FAVORITE_ENTRY_IDS.map((entryId) => ({ id: entryId, entryId }));
}
