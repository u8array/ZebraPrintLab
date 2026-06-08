// ^FB alignment math: Konva's text measurement drifts from Zebra A0;
// compute against fixed advance to match Labelary.

export type BlockJustify = "L" | "C" | "R" | "J";

/** A0 default 9x5 dot matrix; fontWidth=0 advances by h*5/9. */
const A0_DEFAULT_ASPECT = 5 / 9;

/** Per-character advance ratios for Font 0 (CG Triumvirate Bold Condensed)
 *  in fontHeight-units. Calibrated empirically against Labelary so right /
 *  center justify lands at the same pixel as the firmware print, where a
 *  uniform 5/9 cell drifts off by 1-2 px on mixed content. Characters not
 *  in the table fall back to the uniform A0 advance. */
const A0_CHAR_ADVANCE: Record<string, number> = {
  '0': 0.48, '1': 0.48, '2': 0.48, '3': 0.48, '4': 0.48,
  '5': 0.48, '6': 0.48, '7': 0.48, '8': 0.48, '9': 0.48,
  '@': 0.90, '*': 0.48, '$': 0.48, '#': 0.48,
  '!': 0.295, '(': 0.295, ')': 0.295, '.': 0.295, ',': 0.295,
  '/': 0.295, '`': 0.295, ';': 0.295, ':': 0.295, "'": 0.296,
  '[': 0.295, ']': 0.295, ' ': 0.295,
  '&': 0.61, '%': 0.903, '+': 0.905, '=': 0.905,
  '<': 1, '>': 1,
  '?': 0.441, '"': 0.481, '-': 0.5, '_': 0.5,
  A: 0.555, B: 0.555, C: 0.535, D: 0.59, E: 0.5,
  F: 0.5, G: 0.59, H: 0.6101, I: 0.277, J: 0.445,
  K: 0.555, L: 0.481, M: 0.755, N: 0.6083, O: 0.57,
  P: 0.555, Q: 0.57, R: 0.59, S: 0.535, T: 0.5,
  U: 0.609, V: 0.535, W: 0.812, X: 0.555, Y: 0.555, Z: 0.498,
  a: 0.461, b: 0.497, c: 0.442, d: 0.497, e: 0.461,
  f: 0.275, g: 0.497, h: 0.497, i: 0.258, j: 0.259,
  k: 0.444, l: 0.2585, m: 0.754, n: 0.498, o: 0.48,
  p: 0.498, q: 0.498, r: 0.333, s: 0.424, t: 0.276,
  u: 0.498, v: 0.442, w: 0.668, x: 0.442, y: 0.444, z: 0.387,
};

export function zebraGlyphAdvanceDots(fontHeight: number, fontWidth: number): number {
  return fontWidth > 0 ? fontWidth : fontHeight * A0_DEFAULT_ASPECT;
}

/** ^FB slot a: spec skips print when block is narrower than one glyph
 *  cell (explicit `fontWidth` or `h * 5/9` for A0 default). */
export function isBlockTooNarrow(
  blockWidthDots: number,
  fontHeight: number,
  fontWidth: number,
): boolean {
  return blockWidthDots > 0 && blockWidthDots < zebraGlyphAdvanceDots(fontHeight, fontWidth);
}

/** Display-space positions of each word inside one justify=J line. Caller
 *  passes the line's `startDots` (from blockLineStartDots), the extra gap
 *  (from zebraJustifyGapDots), and per-glyph advance metrics. Returns one
 *  entry per word in source order. */
export function blockJustifyWordPositions(args: {
  words: string[];
  rotation: ZplRotation;
  startDots: { x: number; y: number };
  fontHeight: number;
  fontWidth: number;
  extraGapDots: number;
}): { x: number; y: number; text: string }[] {
  const spaceAdvance = zebraGlyphAdvanceDots(args.fontHeight, args.fontWidth);
  let cursorAdv = 0;
  return args.words.map((word) => {
    const adv = blockWordAdvanceDots(args.rotation, cursorAdv);
    const pos = { x: args.startDots.x + adv.dx, y: args.startDots.y + adv.dy, text: word };
    cursorAdv += zebraLineWidthDots(word, args.fontHeight, args.fontWidth) + spaceAdvance + args.extraGapDots;
    return pos;
  });
}

/** ^FB FT-anchor offset: inter-line dots above the last baseline, i.e.
 *  `(blockLines - 1) * lineStep`. Returns 0 when no block is configured. */
export function blockInterLineExtentDots(args: {
  blockWidthDots: number;
  blockLines: number;
  blockLineSpacing: number;
  fontHeight: number;
}): number {
  if (args.blockWidthDots <= 0) return 0;
  return Math.max(0, (args.blockLines - 1) * blockLineStepDots(args.fontHeight, args.blockLineSpacing));
}

/** Canonical Zebra rotation flag. Re-used by registry/text.ts so
 *  consumers don't redeclare the literal union. */
export type ZplRotation = "N" | "R" | "I" | "B";

const neg = (v: number) => (v === 0 ? 0 : -v);

/** Display-space start of line `lineIndex` inside a per-Text rotated
 *  ^FB block. Per-Text rotation rotates each Text around its own (x, y),
 *  so the offsets must be expressed in display coords. `perpDots` covers
 *  indent + align perpendicular to the line-stacking axis. */
export function blockLineStartDots(
  lineIndex: number,
  rotation: ZplRotation,
  perpDots: number,
  lineStepDots: number,
): { x: number; y: number } {
  const step = lineIndex * lineStepDots;
  switch (rotation) {
    case "N": return { x: perpDots, y: step };
    case "R": return { x: neg(step), y: perpDots };
    case "I": return { x: neg(perpDots), y: neg(step) };
    case "B": return { x: step, y: neg(perpDots) };
  }
}

/** Per-word display-space advance along the line's reading direction
 *  for justify=J word-gap stretch. Mirrors `blockLineStartDots` axis
 *  selection. */
export function blockWordAdvanceDots(
  rotation: ZplRotation,
  advanceDots: number,
): { dx: number; dy: number } {
  switch (rotation) {
    case "N": return { dx: advanceDots, dy: 0 };
    case "R": return { dx: 0, dy: advanceDots };
    case "I": return { dx: -advanceDots, dy: 0 };
    case "B": return { dx: 0, dy: -advanceDots };
  }
}

export function zebraLineWidthDots(
  line: string,
  fontHeight: number,
  fontWidth: number,
): number {
  // Explicit fontWidth: ^A0 with non-zero w is a monospaced cell.
  if (fontWidth > 0) return line.length * fontWidth;
  // Proportional A0: sum per-char advance ratios (calibrated table) so
  // right / center justify lines up with Labelary instead of drifting.
  const fallback = fontHeight * A0_DEFAULT_ASPECT;
  let total = 0;
  for (const c of line) {
    const ratio = A0_CHAR_ADVANCE[c];
    total += ratio !== undefined ? ratio * fontHeight : fallback;
  }
  return total;
}

/** L/J start at left; J inner-stretch not visualised. */
export function zebraAlignOffsetDots(
  lineWidthDots: number,
  blockWidthDots: number,
  justify: BlockJustify,
): number {
  if (justify === "C") return Math.max(0, (blockWidthDots - lineWidthDots) / 2);
  if (justify === "R") return Math.max(0, blockWidthDots - lineWidthDots);
  return 0;
}

/** ^FB slot e: indent lines 2+; line 1 stays flush with the block. */
export function zebraHangingIndentOffsetDots(
  lineIndex: number,
  hangingIndentDots: number,
): number {
  return lineIndex > 0 ? hangingIndentDots : 0;
}

/** ^FB justify=J extra dots per word-gap. Returns 0 on the last line
 *  and on single-word lines (spec: last line left-aligned). */
export function zebraJustifyGapDots(
  lineWidthDots: number,
  blockWidthDots: number,
  wordGapCount: number,
  isLastLine: boolean,
): number {
  if (isLastLine || wordGapCount <= 0) return 0;
  const extra = blockWidthDots - lineWidthDots;
  return extra > 0 ? extra / wordGapCount : 0;
}

export function blockLineStepDots(fontHeight: number, blockLineSpacing: number): number {
  return fontHeight + blockLineSpacing;
}

/** ^FB dashed wrap-edge guide: points (x1,y1,x2,y2) for the line that
 *  sits on the end-of-reading side of the rotated block. */
export function blockWrapEdgePoints(
  rotation: ZplRotation,
  bounds: { x: number; y: number; width: number; height: number },
): [number, number, number, number] {
  switch (rotation) {
    case "N":
      return [bounds.x + bounds.width, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height];
    case "R":
      return [bounds.x, bounds.y + bounds.height, bounds.x + bounds.width, bounds.y + bounds.height];
    case "I":
      return [bounds.x, bounds.y, bounds.x, bounds.y + bounds.height];
    case "B":
      return [bounds.x, bounds.y, bounds.x + bounds.width, bounds.y];
  }
}

/** FB block bbox in Group-local display coords. Rotates with the
 *  block-line-stack direction so the Transformer covers visible glyphs
 *  rather than the unrotated layout footprint. */
export function blockBoundsDots(args: {
  blockWidthDots: number;
  blockLines: number;
  blockLineSpacing: number;
  fontHeight: number;
  rotation?: ZplRotation;
}): { x: number; y: number; width: number; height: number } {
  const lineStep = blockLineStepDots(args.fontHeight, args.blockLineSpacing);
  const blockWidth = args.blockWidthDots;
  const linesExtent = args.blockLines > 0 ? (args.blockLines - 1) * lineStep + args.fontHeight : 0;
  switch (args.rotation ?? "N") {
    case "N": return { x: 0,           y: 0,           width: blockWidth,  height: linesExtent };
    case "R": return { x: -linesExtent, y: 0,           width: linesExtent, height: blockWidth };
    case "I": return { x: -blockWidth, y: -linesExtent, width: blockWidth,  height: linesExtent };
    case "B": return { x: 0,           y: -blockWidth, width: linesExtent, height: blockWidth };
  }
}
