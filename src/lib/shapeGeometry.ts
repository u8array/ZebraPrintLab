/**
 * Pure geometric helpers for ZPL shape primitives (^GB / ^GE / ^GC / ^GD).
 *
 * Mirrors Zebra firmware's rendering semantics so that the on-screen
 * Konva canvas, the @napi-rs/canvas pixel-regression renderer, and the
 * ZPL output all describe the same shape:
 *   - Outlines (box / ellipse / circle) extrude thickness *inward* from
 *     the declared bbox; thickness ≥ min(w, h)/2 collapses to solid.
 *   - Diagonal lines (^GD) place the conceptual line on the *left long
 *     edge* of a parallelogram and extrude thickness in +x only — both
 *     endpoints sit on the same side, never the centreline.
 *
 * Keeping the geometry in one pure module prevents drift between the
 * rendering pathways (tests cover the @napi-rs path against Labelary,
 * which transitively validates anything that consumes these helpers).
 */

/**
 * Inset values for an outline rectangle / ellipse / circle whose
 * declared bbox is (0, 0, w, h) with stroke thickness t. The caller
 * uses these to position a *centred-stroke* primitive whose outer
 * edge lands on the declared bbox.
 *
 * When 2t ≥ min(w, h) the outline would meet itself in the middle and
 * Zebra firmware renders solid; `renderFilled` signals that case so
 * callers can drop the stroke and fill (0, 0, w, h) directly.
 */
export interface OutlineInset {
  /** Top-left offset for the inset primitive (= t/2 unless filled). */
  offset: number;
  /** Width of the inset primitive (= w − t unless filled). */
  width: number;
  /** Height of the inset primitive (= h − t unless filled). */
  height: number;
  /** Whether the firmware clamps this outline to a solid shape. */
  renderFilled: boolean;
}

export function outlineInset(
  w: number,
  h: number,
  t: number,
  filled: boolean,
): OutlineInset {
  const clampsToFilled = !filled && t * 2 >= Math.min(w, h);
  const renderFilled = filled || clampsToFilled;
  return {
    offset: renderFilled ? 0 : t / 2,
    width: renderFilled ? w : Math.max(0, w - t),
    height: renderFilled ? h : Math.max(0, h - t),
    renderFilled,
  };
}

/** Four (x, y) vertices in the flat order Konva.Line and 2D canvas
 *  paths both consume. Tuple-typed so callers can destructure without
 *  any `as`-cast or non-null-assertion noise. */
export type ParallelogramPoints = [
  number, number,
  number, number,
  number, number,
  number, number,
];

/**
 * Four parallelogram vertices for a ^GD diagonal line spanning the bbox
 * from (ax, ay) to (bx, by) with thickness t.
 *
 * The conceptual line runs along the polygon's *left long edge*; the
 * other long edge is offset by +t in x. This is the same convention as
 * Zebra firmware (verified pixel-by-pixel against Labelary fixtures).
 */
export function diagonalPolygonPoints(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  t: number,
): ParallelogramPoints {
  const ddx = bx - ax;
  const ddy = by - ay;
  const w = Math.abs(ddx);
  const h = Math.abs(ddy);
  const orientation: "L" | "R" = ddx * ddy >= 0 ? "L" : "R";
  const boxX = ddx < 0 ? ax + ddx : ax;
  const boxY = ddy < 0 ? ay + ddy : ay;
  if (orientation === "L") {
    return [
      boxX,             boxY,
      boxX + t,         boxY,
      boxX + w + t,     boxY + h,
      boxX + w,         boxY + h,
    ];
  }
  return [
    boxX + w,         boxY,
    boxX + w + t,     boxY,
    boxX + t,         boxY + h,
    boxX,             boxY + h,
  ];
}
