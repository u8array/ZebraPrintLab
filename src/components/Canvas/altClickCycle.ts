// Alt+click cycles through stacked hits at a point; tol px window absorbs hand tremor.

export interface CycleAnchor {
  x: number;
  y: number;
  id: string;
}

export const ALT_CYCLE_TOL_PX = 5;

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
