// ^FB alignment math: Konva's text measurement drifts from Zebra A0;
// compute against fixed advance to match Labelary.

export type BlockJustify = "L" | "C" | "R" | "J";

/** A0 default 9x5 dot matrix; fontWidth=0 advances by h*5/9. */
const A0_DEFAULT_ASPECT = 5 / 9;

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
  return line.length * zebraGlyphAdvanceDots(fontHeight, fontWidth);
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
 *  sits on the far side of the block from the reading start. N/I reach
 *  the right edge, R/B reach the bottom edge of the rotated bbox. */
export function blockWrapEdgePoints(
  rotation: ZplRotation,
  bounds: { x: number; y: number; width: number; height: number },
): [number, number, number, number] {
  switch (rotation) {
    case "R":
    case "B":
      return [bounds.x, bounds.y + bounds.height, bounds.x + bounds.width, bounds.y + bounds.height];
    case "N":
    case "I":
      return [bounds.x + bounds.width, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height];
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
