import type { TextProps } from "../registry/text";

/** Defaults applied when a text object's `^FB` block is first
 *  activated. Shared between the manual "Tekstblok" checkbox and
 *  the auto-activation triggered by typing a newline in the editor —
 *  any future tweak (e.g. width derived from label dimensions) lives
 *  here so the two paths can't drift. */
export const FB_DEFAULTS = {
  blockWidth: 400,
  blockLineSpacing: 0,
  blockJustify: "L" as const,
} satisfies Partial<TextProps>;

/** Derive the `Partial<TextProps>` patch to apply when the content
 *  of a text object changes. The patch always carries the new
 *  `content`, plus `^FB` adjustments:
 *
 *   - First newline + `^FB` not yet active → activate with defaults,
 *     `blockLines = lines` so the printer respects every typed row.
 *   - `^FB` already active + content line count differs → sync
 *     `blockLines` both ways so the printed block matches the
 *     editor's visible row count. Users who want a manual buffer
 *     for CSV-bound rows of varying length should disable Tekstblok
 *     and manage it themselves.
 *
 * Pure function for easy unit-testing — the editor's onChange just
 * applies the returned patch via the store. */
export function deriveBlockTextPatch(
  content: string,
  prev: Pick<TextProps, "blockWidth" | "blockLines">,
): Partial<TextProps> {
  const lines = content.split("\n").length;
  const patch: Partial<TextProps> = { content };
  if (lines > 1 && !prev.blockWidth) {
    patch.blockWidth = FB_DEFAULTS.blockWidth;
    patch.blockLines = lines;
    patch.blockLineSpacing = FB_DEFAULTS.blockLineSpacing;
    patch.blockJustify = FB_DEFAULTS.blockJustify;
  } else if (prev.blockWidth && lines !== (prev.blockLines ?? 1)) {
    patch.blockLines = lines;
  }
  return patch;
}
