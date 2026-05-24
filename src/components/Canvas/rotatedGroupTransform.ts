/**
 * Compute the Konva transform that lets an inner Group render content in
 * its *upright* (rotation=N) coordinate system while the parent shows it
 * rotated by the field's ZPL rotation. The returned `{x, y, rotation}`
 * places the inner Group so the rotated content's top-left lands at the
 * outer Group's (0, 0) — i.e. the parent's bbox stays a positive
 * rectangle regardless of orientation.
 *
 * Coordinate convention: Konva is y-down, rotation CW positive.
 *
 *   N : no inner group needed (rotation=0, x=0, y=0).
 *   R : rotate 90° CW.  Upright (0..W, 0..H) → (-H..0, 0..W).
 *       Translate (+H, 0) → bbox (0..H, 0..W).
 *   I : rotate 180°.    Upright (0..W, 0..H) → (-W..0, -H..0).
 *       Translate (+W, +H) → bbox (0..W, 0..H).
 *   B : rotate -90°.    Upright (0..W, 0..H) → (0..H, -W..0).
 *       Translate (0, +W) → bbox (0..H, 0..W).
 *
 * Why an inner-group transform instead of per-element math:
 * historically rotated 1D barcode rendering hand-wrote per-rotation
 * tx/ty/tRot formulas for every text element. Each bug fix touched N
 * symmetric expressions and they drifted apart. Rendering the upright
 * layout once inside a rotated container collapses those to a single
 * source of truth.
 */
export type ZplRotation = "N" | "R" | "I" | "B";

export interface RotatedGroupTransform {
  x: number;
  y: number;
  rotation: number;
}

export function rotatedGroupTransform(
  rotation: ZplRotation,
  uprightW: number,
  uprightH: number,
): RotatedGroupTransform {
  switch (rotation) {
    case "N":
      return { x: 0, y: 0, rotation: 0 };
    case "R":
      return { x: uprightH, y: 0, rotation: 90 };
    case "I":
      return { x: uprightW, y: uprightH, rotation: 180 };
    case "B":
      return { x: 0, y: uprightW, rotation: -90 };
  }
}

/** Outer-bbox dimensions for a given upright (W × H) content under
 *  rotation. R / B swap axes; N / I keep them. Useful when the caller
 *  needs the rotated footprint (e.g. for an invisible bbox rect). */
export function rotatedBboxDims(
  rotation: ZplRotation,
  uprightW: number,
  uprightH: number,
): { width: number; height: number } {
  if (rotation === "R" || rotation === "B") {
    return { width: uprightH, height: uprightW };
  }
  return { width: uprightW, height: uprightH };
}
