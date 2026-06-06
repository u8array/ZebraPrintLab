import { useEffect, useRef } from "react";
import type Konva from "konva";
import { getCurrentObjects } from "../../../store/labelStore";
import {
  ALT_CYCLE_TOL_PX,
  nextCycleIndex,
  type CycleAnchor,
} from "../altClickCycle";
import { objectIdsAtPoint } from "../hitTesting";

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
      // Konva's own hit-graph respects view rotation, pan offset,
      // per-shape transforms and the listening flag, far cheaper than
      // mirroring all of that in our own bbox math.
      const objIds = new Set(getCurrentObjects().map((o) => o.id));
      const hits = objectIdsAtPoint(stage, point, objIds);
      if (hits.length === 0) return;
      e.stopPropagation();
      e.preventDefault();
      const idx = nextCycleIndex(hits, anchorRef.current, point, ALT_CYCLE_TOL_PX);
      // `hits[idx]` is `string | undefined` under noUncheckedIndexedAccess
      // even though idx is guaranteed valid here; the guard satisfies TS.
      const nextId = hits[idx];
      if (!nextId) return;
      anchorRef.current = { x: point.x, y: point.y, id: nextId };
      selectObject(nextId);
    };
    el.addEventListener("mousedown", handler, { capture: true });
    return () => el.removeEventListener("mousedown", handler, { capture: true });
  }, [containerRef, stageRef, selectObject]);
}
