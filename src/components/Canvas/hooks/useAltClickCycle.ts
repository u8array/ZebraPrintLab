import { useEffect, useRef } from "react";
import type Konva from "konva";
import { getCurrentObjects } from "../../../store/labelStore";
import {
  ALT_CYCLE_TOL_PX,
  nextCycleIndex,
  type CycleAnchor,
} from "../altClickCycle";

interface Options {
  containerRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<Konva.Stage | null>;
  selectObject: (id: string | null) => void;
}

/**
 * Alt+click cycles selection through stacked objects so users can reach
 * shapes hidden behind a filled (or inverted) form.
 *
 * Implemented as a native capture-phase mousedown listener: it runs before
 * Konva dispatches the click to children, so `stopPropagation` cleanly
 * takes over selection without competing with the per-object onClick
 * handlers in KonvaObject.
 */
export function useAltClickCycle({ containerRef, stageRef, selectObject }: Options): void {
  const anchorRef = useRef<CycleAnchor | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      if (!e.altKey) return;
      if (e.button !== 0) return;
      const stage = stageRef.current;
      if (!stage) return;
      const rect = el.getBoundingClientRect();
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // Use Konva's own hit-graph: it accounts for view rotation, pan
      // offset, per-shape transforms and the listening flag, all of
      // which our own bbox math would have to mirror by hand.
      const intersections = stage.getAllIntersections(point);
      const objIds = new Set(getCurrentObjects().map((o) => o.id));
      const hits: string[] = [];
      const seen = new Set<string>();
      for (const shape of intersections) {
        // Walk up to the registered object Group (each KonvaObject sets
        // `id={obj.id}` on its outer Group; intersections may land on a
        // child Rect/Text/etc.).
        let n: Konva.Node | null = shape;
        while (n) {
          const id = n.id();
          if (id && objIds.has(id) && !seen.has(id)) {
            hits.push(id);
            seen.add(id);
            break;
          }
          n = n.getParent();
        }
      }
      if (hits.length === 0) return;
      e.stopPropagation();
      e.preventDefault();
      const idx = nextCycleIndex(hits, anchorRef.current, point, ALT_CYCLE_TOL_PX);
      const nextId = hits[idx];
      if (!nextId) return;
      anchorRef.current = { x: point.x, y: point.y, id: nextId };
      selectObject(nextId);
    };
    el.addEventListener("mousedown", handler, { capture: true });
    return () => el.removeEventListener("mousedown", handler, { capture: true });
  }, [containerRef, stageRef, selectObject]);
}
