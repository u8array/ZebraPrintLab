import { useEffect, useRef } from "react";
import type Konva from "konva";
import { getCurrentObjects } from "../../../store/labelStore";
import {
  ALT_CYCLE_TOL_PX,
  LINE_HANDLE_NAME,
  nextCycleIndex,
  type CycleAnchor,
} from "../altClickCycle";
import { objectIdsAtPointForCycle } from "../hitTesting";

interface Options {
  containerRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<Konva.Stage | null>;
  selectObject: (id: string | null) => void;
  /** True when the single selection supports Alt-centered resize (1D barcode,
   *  2D matrix code, or box/ellipse); gates the transformer-anchor bypass only.
   *  Line endpoint handles bypass the cycle unconditionally (LINE_HANDLE_NAME). */
  resizeArmed: boolean;
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
export function useAltClickCycle({
  containerRef,
  stageRef,
  selectObject,
  resizeArmed,
}: Options): void {
  // Kept in a ref so the capture-phase listener reads the latest value without
  // re-subscribing on every selection change.
  const resizeArmedRef = useRef(resizeArmed);
  useEffect(() => {
    resizeArmedRef.current = resizeArmed;
  }, [resizeArmed]);
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
      // A handle sits over object ink, so without this the cycle eats the
      // Alt+handle grab. Line endpoint handles always edit (Alt-centred resize);
      // transformer anchors only for centered-capable types (else they jitter,
      // see supportsCenteredResize), hence the resizeArmed gate.
      const hit = stage.getIntersection(point);
      // draggable() excludes a locked line's handles: they render but can't drag,
      // so cycling must pass through them instead of a dead spot.
      if (hit?.hasName(LINE_HANDLE_NAME) && hit.draggable()) return;
      if (resizeArmedRef.current && hit?.hasName("_anchor")) return;
      // Konva's own hit-graph respects view rotation, pan offset,
      // per-shape transforms and the listening flag; the cycle variant adds
      // a client-rect fallback so frame interiors stay reachable.
      const hits = objectIdsAtPointForCycle(stage, point, getCurrentObjects());
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
