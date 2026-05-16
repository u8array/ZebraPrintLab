/** Browser text-width measurement. Used by the anchor-shift table for
 *  rotation-dependent text positioning, where the I and B FO branches
 *  need the actual rendered width rather than a length-based estimate
 *  (off by 5-15 dots for narrow `1`/`I`/`.` or wide `@`/`W`).
 *
 *  The 2D context is created once and cached for the lifetime of the
 *  page — `measureText` is fast, `createElement('canvas')` isn't.
 *  Falls back to a length-based estimate in non-DOM environments. */

let ctx: CanvasRenderingContext2D | null | undefined;

function getCtx(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  if (typeof document === "undefined") {
    ctx = null;
    return ctx;
  }
  const canvas = document.createElement("canvas");
  ctx = canvas.getContext("2d");
  return ctx;
}

/** Returns the rendered text width in CSS px at the given fontSize.
 *  `fontFamily` and `fontStyle` must match what Konva will use so the
 *  measurement reflects what gets painted. */
export function measureInkWidthPx(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontStyle = "bold",
): number {
  if (!text) return 0;
  const c = getCtx();
  if (!c || typeof c.measureText !== "function") {
    // Fallback heuristic for non-DOM contexts (unit tests of pure
    // helpers). Roboto Condensed Bold wght=900 averages ≈ 0.62·h per
    // glyph; good enough for round-trip tests that don't actually
    // care about exact bbox alignment.
    return text.length * fontSize * 0.62;
  }
  c.font = `${fontStyle} ${fontSize}px ${fontFamily}`;
  return c.measureText(text).width;
}
