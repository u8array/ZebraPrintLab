/**
 * Pure helper for Alt+click "select-below" cycling.
 *
 * Inverted shapes let users see objects layered behind them, but normal
 * click-to-select can only reach the topmost object at a point. Alt+click
 * cycles through the stack at that point: the first click selects the
 * topmost hit, each subsequent Alt+click at (approximately) the same
 * pointer position advances one layer deeper, wrapping at the bottom.
 *
 * The cycling is anchored to a tolerance window in screen-pixel space
 * (`tol`) so hand-tremor between clicks does not reset the cycle, while
 * a deliberate move to a different stack does.
 */

export interface CycleAnchor {
  x: number;
  y: number;
  id: string;
}

/** Pointer-distance window (CSS px) within which two consecutive Alt+clicks
 *  are treated as the *same* cycle position. Picked empirically as the
 *  smallest value that absorbs hand-tremor without merging deliberately
 *  different click points. */
export const ALT_CYCLE_TOL_PX = 5;

/**
 * Pick the next index into `hits` for an Alt+click cycle.
 *
 * - When `anchor` is null, the cycle starts at the topmost hit (index 0).
 * - When `anchor` is set but the new `point` is outside `tol`, the cycle
 *   resets to 0 (user clicked a different stack).
 * - When `anchor.id` is no longer in `hits` (e.g. the object was deleted
 *   between clicks), the cycle restarts at 0.
 * - Otherwise the cycle advances by one, wrapping modulo `hits.length`.
 */
export function nextCycleIndex(
  hits: readonly string[],
  anchor: CycleAnchor | null,
  point: { x: number; y: number },
  tol: number,
): number {
  if (hits.length === 0) return -1;
  if (!anchor) return 0;
  if (Math.abs(anchor.x - point.x) > tol) return 0;
  if (Math.abs(anchor.y - point.y) > tol) return 0;
  const lastIdx = hits.indexOf(anchor.id);
  if (lastIdx < 0) return 0;
  return (lastIdx + 1) % hits.length;
}
