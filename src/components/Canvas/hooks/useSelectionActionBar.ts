import { useLayoutEffect } from "react";
import type Konva from "konva";
import { RULER_SIZE } from "../Ruler";

export const ACTION_BAR_GAP_PX = 22;

interface Options {
  stageRef: React.RefObject<Konva.Stage | null>;
  attachableIds: string[];
  lockedLeafIds: string[];
  previewLocks: boolean;
  /** True while a controller drag is live; the bar is translated by the drag
   *  delta instead. Re-reading client-rects here would lag, since only the
   *  grabbed node's matrices are freshly invalidated, not the siblings'. */
  dragActiveRef: React.RefObject<boolean>;
  /** Owned by LabelCanvas (so the drag onDelta can translate the bar live). */
  actionBarRef: React.RefObject<Konva.Group | null>;
  lockedFrameRef: React.RefObject<Konva.Group | null>;
}

/**
 * Positions the floating selection action bar (centred above the selection,
 * flipped below when it would clip past the ruler, clamped horizontally) and an
 * amber outline per locked leaf (the transformer skips locked nodes). Imperative
 * via beforeDraw so the chrome tracks live node positions during drags, the same
 * timing useKonvaTransformer relies on.
 */
export function useSelectionActionBar({
  stageRef,
  attachableIds,
  lockedLeafIds,
  previewLocks,
  dragActiveRef,
  actionBarRef,
  lockedFrameRef,
}: Options) {
  useLayoutEffect(() => {
    if (previewLocks || attachableIds.length === 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    // Object layer (shared by the bar and the selected nodes); grabbing the
    // layer, not a node, survives node mount timing.
    const layer = stage.getLayers()[0];
    // beforeDraw runs after Konva invalidates the cached transform matrices, so
    // getClientRect sees actual positions; dragmove/xChange read stale data and
    // trail one tick behind on snap-jumps.
    const update = () => {
      // During a controller drag the bar is translated by the drag delta; the
      // client-rects below would lag for the imperatively-moved siblings.
      if (dragActiveRef.current) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const id of attachableIds) {
        const node = stage.findOne(`#${id}`);
        if (!node) continue;
        const r = node.getClientRect({ relativeTo: stage, skipStroke: true });
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
      }
      if (minX === Infinity) return;

      const bar = actionBarRef.current;
      if (bar) {
        const barRect = bar.getClientRect({ relativeTo: stage, skipShadow: true });
        const halfW = barRect.width / 2;
        const halfH = barRect.height / 2;
        const minCx = RULER_SIZE + halfW;
        const maxCx = Math.max(minCx, stage.width() - halfW);
        const cx = Math.min(Math.max((minX + maxX) / 2, minCx), maxCx);
        // Anchor the bar's near EDGE a fixed gap from the selection (not its
        // centre), so a tall/rotated/top-sitting object never gets overlapped:
        // bottom edge `gap` above minY when placed above; top edge `gap` below
        // maxY when flipped under. Pin just below the ruler if neither fits.
        const aboveY = minY - ACTION_BAR_GAP_PX - halfH;
        const belowY = maxY + ACTION_BAR_GAP_PX + halfH;
        let y = aboveY;
        if (aboveY - halfH < RULER_SIZE) {
          y = belowY + halfH <= stage.height() ? belowY : RULER_SIZE + halfH;
        }
        bar.position({ x: cx, y });
      }

      // Per-leaf amber frames, mapped to lockedLeafIds in render order.
      const frames = lockedFrameRef.current?.getChildren();
      if (frames) {
        lockedLeafIds.forEach((id, i) => {
          const node = stage.findOne(`#${id}`);
          const rect = frames[i] as Konva.Rect | undefined;
          if (!node || !rect) return;
          const r = node.getClientRect({ relativeTo: stage, skipStroke: true });
          rect.position({ x: r.x, y: r.y });
          rect.size({ width: r.width, height: r.height });
        });
      }
    };
    update();
    layer?.on("beforeDraw.actionbar", update);
    return () => {
      layer?.off(".actionbar");
    };
  }, [stageRef, attachableIds, lockedLeafIds, previewLocks, dragActiveRef, actionBarRef, lockedFrameRef]);
}
