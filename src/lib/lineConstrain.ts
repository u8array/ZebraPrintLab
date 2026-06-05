/**
 * Pure geometry for constrained line editing.
 *
 * Three modes, all of which project the cursor's drag delta onto a
 * chosen axis so the line's length matches the axial component of the
 * drag (Figma / Sketch convention) instead of the diagonal Euclidean
 * distance:
 *
 *  - `free`    ; no constraint
 *  - `shift`   ; always snap to the nearest 45° step
 *  - `autoSnap`; snap to the nearest 45° step only when within ±5°,
 *                 otherwise free (Figma's "smart guides" behaviour)
 */

export type ConstrainMode = "free" | "shift" | "autoSnap";

/** Tolerance in degrees for `autoSnap` mode; below this distance from
 *  a 45° step the angle is snapped, above it the raw angle is kept. */
const AUTO_SNAP_TOLERANCE_DEG = 5;

export interface LineGeometry {
  length: number;
  angle: number;
  /** Projected delta from origin to the constrained endpoint, rounded to
   *  integer dots. Convenient for callers that need to position the
   *  endpoint visually rather than recomputing `length * cos/sin`. */
  dx: number;
  dy: number;
}

function makeFree(dxDots: number, dyDots: number): LineGeometry {
  const length = Math.max(
    1,
    Math.round(Math.sqrt(dxDots * dxDots + dyDots * dyDots)),
  );
  const angle = Math.round((Math.atan2(dyDots, dxDots) * 180) / Math.PI);
  return { length, angle, dx: Math.round(dxDots), dy: Math.round(dyDots) };
}

/** Wrap to (-180, 180] so flipped axis angles stay in atan2's natural range. */
function normalizeAngle(deg: number): number {
  let n = deg % 360;
  if (n > 180) n -= 360;
  if (n <= -180) n += 360;
  return n;
}

/** Project (dxDots, dyDots) onto the line at `axisAngleDeg`. Picks the
 *  axis direction (axisAngleDeg or its 180°-flip) so the projected length
 *  is non-negative; the line always follows the cursor. */
function projectOntoAxis(
  dxDots: number,
  dyDots: number,
  axisAngleDeg: number,
): LineGeometry {
  const rad = (axisAngleDeg * Math.PI) / 180;
  const proj = dxDots * Math.cos(rad) + dyDots * Math.sin(rad);
  const angle = proj >= 0 ? axisAngleDeg : normalizeAngle(axisAngleDeg + 180);
  const length = Math.max(1, Math.round(Math.abs(proj)));
  const projRad = (angle * Math.PI) / 180;
  return {
    length,
    angle,
    dx: Math.round(length * Math.cos(projRad)),
    dy: Math.round(length * Math.sin(projRad)),
  };
}

export function constrainLine(
  dxDots: number,
  dyDots: number,
  mode: ConstrainMode,
): LineGeometry {
  if (mode === "free") return makeFree(dxDots, dyDots);

  const rawAngle = (Math.atan2(dyDots, dxDots) * 180) / Math.PI;
  const snappedAngle = Math.round(rawAngle / 45) * 45;
  if (mode === "shift") return projectOntoAxis(dxDots, dyDots, snappedAngle);

  // autoSnap: only project when the raw angle is close enough to a step.
  const within = Math.abs(rawAngle - snappedAngle) <= AUTO_SNAP_TOLERANCE_DEG;
  return within
    ? projectOntoAxis(dxDots, dyDots, snappedAngle)
    : makeFree(dxDots, dyDots);
}
