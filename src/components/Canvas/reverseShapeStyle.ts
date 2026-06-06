/**
 * Per-shape paint values for the field-level `^LR` (reverse) state.
 *
 * Box and ellipse share the same paint rules; black/white knockout via
 * a `difference` blend, with a fill/stroke swap so a filled outline
 * doesn't band when the stroke flips to white and the fill flips back
 * to black. The two render paths agreed in the editor by coincidence;
 * pulling the colour table out of both call sites makes that agreement
 * explicit and stops the two from drifting apart on the next colour
 * tweak.
 *
 * Line has its own simpler variant (stroke-only, no fill) and stays
 * separate.
 */

export interface ReverseShapeStyle {
  stroke: string;
  fill: string;
  /** Konva's `globalCompositeOperation`. `difference` produces the
   *  print-correct knockout on the white label and inverts darker
   *  shapes underneath; `source-over` is the default upright paint. */
  globalCompositeOperation: "difference" | "source-over";
}

export function reverseShapeStyle(
  reverse: boolean | undefined,
  color: "B" | "W",
  renderFilled: boolean,
): ReverseShapeStyle {
  const isReverse = !!reverse;
  const shapeColor = color === "B" ? "#000000" : "#cccccc";
  return {
    stroke: isReverse
      ? renderFilled
        ? "transparent"
        : "#ffffff"
      : shapeColor,
    fill: isReverse
      ? renderFilled
        ? "#ffffff"
        : "transparent"
      : renderFilled
        ? shapeColor
        : "transparent",
    globalCompositeOperation: isReverse ? "difference" : "source-over",
  };
}
