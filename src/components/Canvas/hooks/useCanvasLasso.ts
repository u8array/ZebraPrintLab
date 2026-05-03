import { useState, useRef } from "react";
import type Konva from "konva";
import { useLabelStore, currentObjects } from "../../../store/labelStore";
import { getIdsIntersectingRect, type LassoRect } from "../lassoGeometry";

interface Options {
  containerRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<Konva.Stage | null>;
  spaceDown: boolean;
  selectObjects: (ids: string[]) => void;
}

export interface LassoState {
  lasso: LassoRect | null;
  /** Returns true if a lasso gesture just ended; clears the flag. */
  consumeDidLasso: () => boolean;
  cancelLasso: () => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onStageMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

export function useCanvasLasso({ containerRef, stageRef, spaceDown, selectObjects }: Options): LassoState {
  const [lasso, setLasso] = useState<LassoRect | null>(null);
  const lassoRectRef = useRef<LassoRect | null>(null);
  const lassoStartRef = useRef<{ x: number; y: number } | null>(null);
  const didLassoRef = useRef(false);

  const cancelLasso = () => {
    lassoStartRef.current = null;
    lassoRectRef.current = null;
    setLasso(null);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!lassoStartRef.current || !containerRef.current) return;
    const cr = containerRef.current.getBoundingClientRect();
    const px = e.clientX - cr.left;
    const py = e.clientY - cr.top;
    const dx = px - lassoStartRef.current.x;
    const dy = py - lassoStartRef.current.y;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    didLassoRef.current = true;
    const rect = {
      x: Math.min(lassoStartRef.current.x, px),
      y: Math.min(lassoStartRef.current.y, py),
      w: Math.abs(dx),
      h: Math.abs(dy),
    };
    lassoRectRef.current = rect;
    setLasso(rect);
  };

  const onMouseUp = () => {
    if (!lassoStartRef.current) return;
    lassoStartRef.current = null;
    const rect = lassoRectRef.current;
    lassoRectRef.current = null;
    setLasso(null);
    if (!rect || !stageRef.current) return;
    const ids = currentObjects(useLabelStore.getState()).map((o) => o.id);
    selectObjects(getIdsIntersectingRect(stageRef.current, ids, rect));
  };

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0 || spaceDown) return;
    const targetId = e.target.id();
    const onObject = currentObjects(useLabelStore.getState()).some((o) => o.id === targetId);
    if (onObject || e.target.getParent()?.className === "Transformer") return;
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;
    lassoStartRef.current = pos;
    didLassoRef.current = false;
  };

  const consumeDidLasso = () => {
    if (!didLassoRef.current) return false;
    didLassoRef.current = false;
    return true;
  };

  return { lasso, consumeDidLasso, cancelLasso, onMouseMove, onMouseUp, onStageMouseDown };
}
