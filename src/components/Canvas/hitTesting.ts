import type Konva from "konva";

/**
 * Resolve the registered object ids at a stage-relative point, top first.
 *
 * `stage.getAllIntersections` returns Konva nodes in z-order (front first),
 * which may be child shapes of a registered object Group rather than the
 * Group itself; every `KonvaObject` puts `id={obj.id}` on the *outer*
 * Group. So we walk each hit upward until we land on a candidate id, dedupe,
 * and emit in the same z-order Konva produced.
 *
 * Used by:
 *  - Alt+click cycle: cycles through every overlapping object at a point.
 *  - Click-passthrough for locked objects: finds the next non-locked hit.
 */
export function objectIdsAtPoint(
  stage: Konva.Stage,
  point: { x: number; y: number },
  candidates: ReadonlySet<string>,
): string[] {
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const shape of stage.getAllIntersections(point)) {
    let n: Konva.Node | null = shape;
    while (n) {
      const id = n.id();
      if (id && candidates.has(id) && !seen.has(id)) {
        hits.push(id);
        seen.add(id);
        break;
      }
      n = n.getParent();
    }
  }
  return hits;
}
