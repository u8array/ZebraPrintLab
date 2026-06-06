import { useState, useRef } from "react";
import type Konva from "konva";
import { getCurrentObjects } from "../../../store/labelStore";
import { isGroup, type LabelObject } from "../../../types/Group";
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
    // Figma-style: locked objects opt out of lasso selection; they can't
    // be moved or transformed, so grabbing them into a marquee selection
    // would make the post-lasso drag feel dead. Direct click and the
    // LayersPanel still target locked items, so bulk-unlock stays possible.
    // Leaves are the only Konva-rendered things, so intersect on those, then
    // map each captured leaf to its outermost group so a lasso over a
    // grouped child surfaces the group as the selection unit.
    //
    // Single-pass walk: collect unlocked leaf ids and the topmost group
    // each leaf belongs to (or the leaf itself if at top level) so the
    // hit→selection promote below is a Map lookup instead of an O(tree)
    // ancestor walk per hit. Lock cascades from the top-level container.
    const objects = getCurrentObjects();
    const leafIds: string[] = [];
    const selectionTarget = new Map<string, string>();
    const walk = (
      nodes: LabelObject[],
      inheritedLocked: boolean,
      topAncestorId: string | null,
    ) => {
      for (const n of nodes) {
        const locked = inheritedLocked || !!n.locked;
        const ancestor = topAncestorId ?? n.id;
        if (isGroup(n)) {
          walk(n.children, locked, ancestor);
        } else if (!locked) {
          leafIds.push(n.id);
          selectionTarget.set(n.id, ancestor);
        }
      }
    };
    walk(objects, false, null);
    const hits = getIdsIntersectingRect(stageRef.current, leafIds, rect);
    const promoted = new Set(hits.map((id) => selectionTarget.get(id) ?? id));
    selectObjects([...promoted]);
  };

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0 || spaceDown) return;
    const targetId = e.target.id();
    const onObject = getCurrentObjects().some((o) => o.id === targetId);
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
