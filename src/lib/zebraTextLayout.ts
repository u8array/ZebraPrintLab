/** Zebra-style layout math for `^FB` block text. Browser-font canvas
 *  measurement (Konva's default for `Text.align`) disagrees with
 *  Zebra's bitmap-font rendering by enough that centred / right-aligned
 *  text on the canvas drifts visibly from the Labelary preview. Zebra's
 *  A0 font advances each glyph by `fontWidth` dots (or `fontHeight`
 *  when `fontWidth == 0`, the "auto-square" default); compute alignment
 *  positions against that fixed advance so the canvas matches the
 *  printer instead of the browser. */

export type BlockJustify = "L" | "C" | "R" | "J";

/** ZPL Type-0 font default aspect ratio. The built-in A0 font is
 *  defined with a 9×5 dot matrix (height×width); when `^A0,h,0` is
 *  emitted (auto-width), the firmware advances each glyph by
 *  `h × 5/9` dots, not `h`. Using `h` here would make the canvas's
 *  alignment math compute lines as wider than the printed reality and
 *  centred / right-aligned text drift left vs Labelary. */
const A0_DEFAULT_ASPECT = 5 / 9;

/** Effective per-glyph advance in dots for ZPL A0 at the given
 *  `fontHeight` / `fontWidth`. `fontWidth = 0` is Zebra shorthand for
 *  "use the font's default aspect" — for A0 that's a 5:9 ratio
 *  applied to the height. */
export function zebraGlyphAdvanceDots(fontHeight: number, fontWidth: number): number {
  return fontWidth > 0 ? fontWidth : fontHeight * A0_DEFAULT_ASPECT;
}

/** Text-line width in dots that Zebra's A0 printer would render — the
 *  glyph-count × advance formula `^FB` justification is computed
 *  against. */
export function zebraLineWidthDots(
  line: string,
  fontHeight: number,
  fontWidth: number,
): number {
  return line.length * zebraGlyphAdvanceDots(fontHeight, fontWidth);
}

/** Horizontal offset (in dots, relative to the block's left edge) that
 *  a line of `lineLength` glyphs gets at the given `justify` mode
 *  inside a `blockWidth`-dots block. Negative widths clamp to 0 (the
 *  printer never shifts text past the block's left edge). */
export function zebraAlignOffsetDots(
  lineWidthDots: number,
  blockWidthDots: number,
  justify: BlockJustify,
): number {
  if (justify === "C") return Math.max(0, (blockWidthDots - lineWidthDots) / 2);
  if (justify === "R") return Math.max(0, blockWidthDots - lineWidthDots);
  // L and J both start at the left edge — J only stretches the inner
  // spacing of non-last lines, which we don't visualise on canvas.
  return 0;
}
