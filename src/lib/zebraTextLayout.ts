// ^FB alignment math: Konva's text measurement drifts from Zebra A0;
// compute against fixed advance to match Labelary.

export type BlockJustify = "L" | "C" | "R" | "J";

/** A0 default 9x5 dot matrix; fontWidth=0 advances by h*5/9. */
const A0_DEFAULT_ASPECT = 5 / 9;

export function zebraGlyphAdvanceDots(fontHeight: number, fontWidth: number): number {
  return fontWidth > 0 ? fontWidth : fontHeight * A0_DEFAULT_ASPECT;
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

export function blockLineStepDots(fontHeight: number, blockLineSpacing: number): number {
  return fontHeight + blockLineSpacing;
}

/** FB block bbox at (0,0) so the Transformer selection pins to FO anchor. */
export function blockBoundsDots(args: {
  blockWidthDots: number;
  blockLines: number;
  blockLineSpacing: number;
  fontHeight: number;
}): { x: number; y: number; width: number; height: number } {
  // N lines have N-1 gaps; mirrors text.tsx emit (h*n + spacing*(n-1)).
  const lineStep = blockLineStepDots(args.fontHeight, args.blockLineSpacing);
  return {
    x: 0,
    y: 0,
    width: args.blockWidthDots,
    height: args.blockLines > 0 ? (args.blockLines - 1) * lineStep + args.fontHeight : 0,
  };
}
