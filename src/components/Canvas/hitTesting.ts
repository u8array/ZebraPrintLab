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

/** {@link objectIdsAtPoint} for the alt-click cycle: its contract is every
 *  object stacked at the point, so hit-transparent frame interiors
 *  (shapeHitProps) fall back to a client-rect test. Top first. */
export function objectIdsAtPointForCycle(
  stage: Konva.Stage,
  point: { x: number; y: number },
  objects: readonly { id: string; type: string }[],
): string[] {
  const hitSet = new Set(objectIdsAtPoint(stage, point, new Set(objects.map((o) => o.id))));
  const out: string[] = [];
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (!o) continue;
    if (hitSet.has(o.id)) {
      out.push(o.id);
      continue;
    }
    if (o.type !== "box" && o.type !== "ellipse") continue;
    const node = stage.findOne(`#${o.id}`);
    if (!node) continue;
    const r = node.getClientRect({ relativeTo: stage });
    if (point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height) {
      out.push(o.id);
    }
  }
  return out;
}
