import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useDroppable, useDndMonitor } from "@dnd-kit/core";
import type { PaletteDragData } from "../../dnd/types";
import { Stage, Layer, Group, Image as KImage, Rect, Transformer } from "react-konva";
import type Konva from "konva";
import { useLabelStore, useCurrentObjects, currentObjects, getCurrentObjects, selectPreviewLocksEditor } from "../../store/labelStore";
import { isGroup, getAllLeaves, expandSelection, selectionTargetId, findObjectById, type LabelObject } from "../../types/Group";
import { pxToDots, SCREEN_PX_PER_MM } from "../../lib/coordinates";
import { SNAP_OPTIONS } from "../../lib/units";
import type { Unit } from "../../lib/units";
import { computeSnap } from "../../lib/snapGuides";
import type { SnapGuide } from "../../lib/snapGuides";
import { computeGroupCenterDelta } from "../../lib/alignment";
import { isEditableTarget } from "../../lib/dom";
import type { AlignAxis } from "../../lib/alignment";
import { KonvaObject } from "./KonvaObject";
import { Grid } from "./Grid";
import { GuideLines } from "./GuideLines";
import { Ruler, RULER_SIZE } from "./Ruler";
import { getEntry } from "../../registry";
import type { LeafObject } from "../../registry";
import { useColorScheme } from "../../lib/useColorScheme";
import { objectIdsAtPoint } from "./hitTesting";
import { useT } from "../../lib/useT";
import { useCanvasPanZoom } from "./hooks/useCanvasPanZoom";
import { useCanvasLasso } from "./hooks/useCanvasLasso";
import { useKonvaTransformer } from "./hooks/useKonvaTransformer";
import { PaginationControl } from "./PaginationControl";
import {
  axisReversal,
  inverseRotateDelta,
  isAxisSwapped,
  nextRotation,
  type ViewRotation,
} from "./rotationGeometry";
import { useAltClickCycle } from "./hooks/useAltClickCycle";
import { RotationButton } from "./RotationButton";
import {
  getStepRotation,
  nextZplRotation,
} from "../../registry/rotation";

const PADDING = 40;
const ROTATE_BUTTON_GAP_PX = 16;
const ROTATE_BUTTON_TOP_OFFSET_PX = -2;

interface Props {
  unit: Unit;
  showGrid: boolean;
  onGridToggle: () => void;
  snapEnabled: boolean;
  onSnapToggle: () => void;
  snapSizeMm: number;
  onSnapSizeChange: (mm: number) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  viewRotation: ViewRotation;
  onViewRotationChange: (rotation: ViewRotation) => void;
}

export interface LabelCanvasHandle {
  alignSelectionToLabel: (axis: AlignAxis) => void;
}

export const LabelCanvas = forwardRef<LabelCanvasHandle, Props>(function LabelCanvas({
  unit,
  showGrid,
  onGridToggle,
  snapEnabled,
  onSnapToggle,
  snapSizeMm,
  onSnapSizeChange,
  zoom,
  onZoomChange,
  viewRotation,
  onViewRotationChange,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const rotateView = () => onViewRotationChange(nextRotation(viewRotation));
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [ghost, setGhost] = useState<LeafObject | null>(null);

  // Bypasses @dnd-kit scroll-adjusted delta; palette scroll momentum
  // would otherwise offset touch-device drops.
  const lastPointerRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  const colors = useColorScheme();
  const t = useT();

  const {
    label,
    selectedIds,
    addObject,
    updateObject,
    updateObjects,
    selectObject,
    toggleSelectObject,
    selectObjects,
  } = useLabelStore();
  const objects = useCurrentObjects();
  const previewMode = useLabelStore((s) => s.previewMode);
  const previewLocks = useLabelStore(selectPreviewLocksEditor);
  const exitPreviewMode = useLabelStore((s) => s.exitPreviewMode);

  // Pre-decode so toggling preview on doesn't flash a frame of empty space.
  const [previewImg, setPreviewImg] = useState<HTMLImageElement | null>(null);
  const previewUrl = previewMode.status === 'active' ? previewMode.url : null;
  useEffect(() => {
    if (!previewUrl) {
      setPreviewImg(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setPreviewImg(img);
    img.src = previewUrl;
    return () => {
      img.onload = null;
    };
  }, [previewUrl]);

  // Leaves only; group lock/visible cascades down so per-leaf checks see one value.
  const visibleLeaves = useMemo(() => {
    const out: LeafObject[] = [];
    const walk = (nodes: LabelObject[], inheritedLocked: boolean) => {
      for (const n of nodes) {
        if (n.visible === false) continue;
        const locked = inheritedLocked || !!n.locked;
        if (isGroup(n)) {
          walk(n.children, locked);
        } else {
          out.push(locked && !n.locked ? ({ ...n, locked: true } as LeafObject) : n);
        }
      }
    };
    walk(objects, false);
    return out;
  }, [objects]);

  // Expand selection so group-click feels like Figma multi-drag.
  const allLeaves = useMemo(() => getAllLeaves(objects), [objects]);
  const attachableIds = useMemo(
    () => expandSelection(objects, selectedIds),
    [objects, selectedIds],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useAltClickCycle({ containerRef, stageRef, selectObject });

  // Global binding so user can exit preview from anywhere.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      if (!selectPreviewLocksEditor(useLabelStore.getState())) return;
      e.preventDefault();
      useLabelStore.getState().exitPreviewMode();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Delete/Backspace removes all selected objects; ignored when focus is inside an input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Delete" && e.code !== "Backspace") return;
      if (isEditableTarget(e.target as HTMLElement)) return;
      // Preview is a frozen snapshot; editing would drift the comparison.
      if (selectPreviewLocksEditor(useLabelStore.getState())) return;
      const { selectedIds: ids } = useLabelStore.getState();
      if (ids.length === 0) return;
      e.preventDefault();
      useLabelStore.getState().removeSelectedObjects();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // arrow keys move the selected object; ignored when focus is inside an input
  useEffect(() => {
    const ARROW = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    const onKeyDown = (e: KeyboardEvent) => {
      if (!ARROW.has(e.code)) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const state = useLabelStore.getState();
      if (selectPreviewLocksEditor(state)) return;
      const ids = state.selectedIds;
      const objs = currentObjects(state);
      if (ids.length === 0) return;
      e.preventDefault();

      // shift = 10 mm, normal = snapSize when snap on, 1 dot when snap off
      const step = e.shiftKey
        ? label.dpmm * 10
        : snapEnabled
          ? Math.round(snapSizeMm * label.dpmm)
          : 1;
      const screenDx = e.code === "ArrowRight" ? step : e.code === "ArrowLeft" ? -step : 0;
      const screenDy = e.code === "ArrowDown" ? step : e.code === "ArrowUp" ? -step : 0;
      // Inverse-rotate so arrow direction matches visual.
      const [dx, dy] = inverseRotateDelta(screenDx, screenDy, viewRotation);

      // Expand so a selected group moves its leaves (group x/y is conventionally 0).
      const expanded = expandSelection(objs, ids);
      updateObjects(
        expanded.flatMap((sid) => {
          const obj = findObjectById(objs, sid);
          if (!obj || obj.locked) return [];
          return [{ id: sid, changes: { x: obj.x + dx, y: obj.y + dy } }];
        }),
      );
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [snapEnabled, snapSizeMm, label.dpmm, updateObjects, viewRotation]);

  // usable area after reserving space for the ruler
  const usableWidth = containerSize.width - RULER_SIZE;
  const usableHeight = containerSize.height - RULER_SIZE;

  // ^LS shifts all content to the right by labelShift dots. The label rect
  // grows by that amount so the shifted content is fully visible.
  const labelShiftMm = (label.labelShift ?? 0) / label.dpmm;
  const effectiveWidthMm = label.widthMm + labelShiftMm;

  // zoom=1 = 100% (96 dpi CSS); fitZoom swaps axes at 90/270.
  const axisSwapped = isAxisSwapped(viewRotation);
  const fitWidthMm = axisSwapped ? label.heightMm : effectiveWidthMm;
  const fitHeightMm = axisSwapped ? effectiveWidthMm : label.heightMm;
  const fitZoom = usableWidth > 0 && usableHeight > 0
    ? Math.min(
        (usableWidth - PADDING * 2) / (fitWidthMm * SCREEN_PX_PER_MM),
        (usableHeight - PADDING * 2) / (fitHeightMm * SCREEN_PX_PER_MM),
      )
    : 1;

  // Init zoom to fit once container is sized so label is immediately visible.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current || usableWidth <= 0) return;
    didInitRef.current = true;
    onZoomChange(fitZoom);
  }, [usableWidth, fitZoom, onZoomChange]);

  const {
    panOffset,
    spaceDown,
    isPanningRef,
    consumeDidPan,
    zoomIn,
    zoomOut,
    zoomFit,
    onMouseDown: onPanMouseDown,
    onMouseMove: onPanMouseMove,
    onMouseUp: onPanMouseUp,
    cursor,
  } = useCanvasPanZoom({ zoom, onZoomChange, fitZoom, containerRef });

  const scale = SCREEN_PX_PER_MM * zoom;
  const labelWidthPx = effectiveWidthMm * scale;
  const labelHeightPx = label.heightMm * scale;
  const labelOffsetX = RULER_SIZE + (usableWidth - labelWidthPx) / 2 + panOffset.x;
  const labelShiftPx = labelShiftMm * scale;
  const objectsOffsetX = labelOffsetX + labelShiftPx;
  const labelOffsetY = RULER_SIZE + (usableHeight - labelHeightPx) / 2 + panOffset.y;

  // Visual label geometry after view rotation (axes swap at 90°/270°).
  // The Konva Group rotates around the label center, so the visual size
  // swaps width/height while the center stays put.
  const labelCenterX = labelOffsetX + labelWidthPx / 2;
  const labelCenterY = labelOffsetY + labelHeightPx / 2;
  const visualLabelWidthPx = axisSwapped ? labelHeightPx : labelWidthPx;
  const visualLabelHeightPx = axisSwapped ? labelWidthPx : labelHeightPx;
  const visualLabelX = labelCenterX - visualLabelWidthPx / 2;
  const visualLabelY = labelCenterY - visualLabelHeightPx / 2;
  const rulerWidthMm = axisSwapped ? label.heightMm : effectiveWidthMm;
  const rulerHeightMm = axisSwapped ? effectiveWidthMm : label.heightMm;
  const rulerReversal = axisReversal(viewRotation);

  const snapUnit = Math.round(snapSizeMm * label.dpmm);
  const snap = (dots: number) =>
    snapEnabled ? Math.round(dots / snapUnit) * snapUnit : dots;

  // One stable closure to avoid 60Hz churning N per-object closures.
  const getOthersSnapshot = useCallback((excludeId: string) => {
    const stage = stageRef.current;
    if (!stage) return [];
    const rects = [];
    for (const o of getCurrentObjects()) {
      if (o.id === excludeId) continue;
      const n = stage.findOne<Konva.Node>(`#${o.id}`);
      if (!n) continue;
      const r = n.getClientRect({ relativeTo: stage });
      rects.push({ id: o.id, x: r.x, y: r.y, width: r.width, height: r.height });
    }
    return rects;
  }, []);

  const {
    lasso: lassoRect,
    consumeDidLasso,
    cancelLasso,
    onMouseMove: onLassoMouseMove,
    onMouseUp: onLassoMouseUp,
    onStageMouseDown,
  } = useCanvasLasso({ containerRef, stageRef, spaceDown, selectObjects });

  // Snap math operates in stage-screen space, so the label rect must
  // reflect the rotation-aware visual bounds, not layout coords.
  const transformerSnapLabelRect = useMemo(
    () => ({
      id: "_lbl",
      x: visualLabelX,
      y: visualLabelY,
      width: visualLabelWidthPx,
      height: visualLabelHeightPx,
    }),
    [visualLabelX, visualLabelY, visualLabelWidthPx, visualLabelHeightPx],
  );

  useImperativeHandle(
    ref,
    () => ({
      alignSelectionToLabel: (axis) => {
        const stage = stageRef.current;
        if (!stage) return;
        const state = useLabelStore.getState();
        const ids = state.selectedIds;
        if (ids.length === 0) return;
        const objs = currentObjects(state);
        // Konva nodes exist only for leaves; expand group ids.
        const attachable = expandSelection(objs, ids);

        const boxes = attachable.flatMap((id) => {
          const node = stage.findOne<Konva.Node>(`#${id}`);
          if (!node) return [];
          const r = node.getClientRect({ relativeTo: stage });
          return [{ id, x: r.x, y: r.y, width: r.width, height: r.height }];
        });
        if (boxes.length === 0) return;

        const { dx: screenDx, dy: screenDy } = computeGroupCenterDelta(
          boxes,
          transformerSnapLabelRect,
          axis,
        );
        if (screenDx === 0 && screenDy === 0) return;

        const [layoutDx, layoutDy] = inverseRotateDelta(
          screenDx,
          screenDy,
          viewRotation,
        );
        // Integer dots preserves store invariant; mmToDots convention.
        const pxPerDot = scale / label.dpmm;
        const dxDots = Math.round(layoutDx / pxPerDot);
        const dyDots = Math.round(layoutDy / pxPerDot);

        const updates = attachable.flatMap((id) => {
          const obj = findObjectById(objs, id);
          if (!obj) return [];
          return [
            { id, changes: { x: obj.x + dxDots, y: obj.y + dyDots } },
          ];
        });
        if (updates.length > 0) updateObjects(updates);
      },
    }),
    [transformerSnapLabelRect, scale, label.dpmm, viewRotation, updateObjects],
  );

  const {
    rotateEnabled,
    resizeEnabled,
    enabledAnchors,
    onTransformStart,
    boundBoxFunc,
    onTransformEnd,
  } = useKonvaTransformer({
    transformerRef,
    stageRef,
    selectedIds: attachableIds,
    objects: allLeaves,
    scale,
    dpmm: label.dpmm,
    objectsOffsetX,
    labelOffsetY,
    snap,
    updateObject,
    labelRect: transformerSnapLabelRect,
    objectSnapEnabled: !snapEnabled,
    setGuides,
    viewRotation,
    previewLocks,
  });

  // Step-rotation only (text/serial/barcodes); box/ellipse/line/image use Transformer.
  const singleSelected = selectedIds.length === 1
    ? objects.find((o) => o.id === selectedIds[0]) ?? null
    : null;
  const stepRotation = singleSelected ? getStepRotation(singleSelected) : null;
  const [rotationBtnPos, setRotationBtnPos] = useState<{ x: number; y: number } | null>(null);
  const rotationBtnRef = useRef<Konva.Group>(null);
  useLayoutEffect(() => {
    if (!singleSelected || !stepRotation) {
      setRotationBtnPos(null);
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    const node = stage.findOne(`#${singleSelected.id}`);
    if (!node) {
      setRotationBtnPos(null);
      return;
    }
    // Direct node update for 60fps drag; React state kept in sync.
    // Per-node listener because Konva's transform doesn't bubble.
    const update = () => {
      const rect = node.getClientRect({ relativeTo: stage, skipStroke: true });
      const x = rect.x + rect.width + ROTATE_BUTTON_GAP_PX;
      const y = rect.y + ROTATE_BUTTON_TOP_OFFSET_PX;
      rotationBtnRef.current?.position({ x, y });
      setRotationBtnPos({ x, y });
    };
    update();
    node.on("dragmove.rotbtn transform.rotbtn", update);
    return () => {
      node.off("dragmove.rotbtn transform.rotbtn");
    };
  }, [singleSelected, stepRotation, scale, viewRotation]);

  const handleRotateStep = () => {
    if (!singleSelected || !stepRotation) return;
    updateObject(singleSelected.id, {
      props: { rotation: nextZplRotation(stepRotation) },
    });
  };

  const handleObjectChange = (
    id: string,
    changes: Parameters<typeof updateObject>[1],
  ) => {
    const finalChanges = {
      ...changes,
      ...(changes.x !== undefined && { x: snap(changes.x) }),
      ...(changes.y !== undefined && { y: snap(changes.y) }),
    };
    // Fresh getState() guards stale closure across simultaneous DragEnd
    // events; expandSelection propagates the delta to group leaves.
    const state = useLabelStore.getState();
    const currentObjs = currentObjects(state);
    const selIds = expandSelection(currentObjs, state.selectedIds);
    if (
      selIds.length > 1 &&
      selIds.includes(id) &&
      (finalChanges.x !== undefined || finalChanges.y !== undefined)
    ) {
      const srcObj = findObjectById(currentObjs, id);
      if (srcObj) {
        const ddx = finalChanges.x !== undefined ? finalChanges.x - srcObj.x : 0;
        const ddy = finalChanges.y !== undefined ? finalChanges.y - srcObj.y : 0;
        updateObjects([
          { id, changes: finalChanges },
          ...selIds
            .filter((sid) => sid !== id)
            .flatMap((sid) => {
              const other = findObjectById(currentObjs, sid);
              return other
                ? [{ id: sid, changes: { x: other.x + ddx, y: other.y + ddy } }]
                : [];
            }),
        ]);
        return;
      }
    }
    updateObject(id, finalChanges);
  };

  // Object-snap: applied after grid-snap on every dragmove, single-object only.
  const handleStageDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (snapEnabled) return;
    const node = e.target;
    const objId = node.id();
    if (!objId || !stageRef.current) return;

    const objs = getCurrentObjects();
    const obj = findObjectById(objs, objId);
    if (!obj) return;

    const stage = stageRef.current;
    const dr = node.getClientRect({ relativeTo: stage });
    const draggedRect = { id: objId, x: dr.x, y: dr.y, width: dr.width, height: dr.height };

    const otherRects = [];
    for (const o of getAllLeaves(objs)) {
      if (o.id === objId) continue;
      const n = stage.findOne<Konva.Node>(`#${o.id}`);
      if (!n) continue;
      const r = n.getClientRect({ relativeTo: stage });
      otherRects.push({ id: o.id, x: r.x, y: r.y, width: r.width, height: r.height });
    }

    // Stage space; clientRect already accounts for Group transform.
    const labelRect = {
      id: "_lbl",
      x: visualLabelX,
      y: visualLabelY,
      width: visualLabelWidthPx,
      height: visualLabelHeightPx,
    };

    const result = computeSnap(
      draggedRect,
      otherRects,
      undefined,
      labelRect,
      labelRect,
    );
    // result is screen-space; node.position() is group-local, so inverse-rotate.
    const screenDx = result.x - dr.x;
    const screenDy = result.y - dr.y;
    if (screenDx !== 0 || screenDy !== 0) {
      const [localDx, localDy] = inverseRotateDelta(screenDx, screenDy, viewRotation);
      node.position({ x: node.x() + localDx, y: node.y() + localDy });
    }
    setGuides(result.guides);
  };

  const handleStageDragEnd = () => setGuides([]);

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (previewLocks) return;
    if (consumeDidPan()) return;
    if (consumeDidLasso()) return;
    if (e.target === e.target.getStage()) selectObjects([]);
  };

  /** Figma idiom: locked object passes click through to next non-locked hit. */
  const handleLockedClick = (add: boolean) => {
    const stage = stageRef.current;
    const cr = containerRef.current?.getBoundingClientRect();
    if (!stage || !cr) return;
    const point = {
      x: lastPointerRef.current.x - cr.left,
      y: lastPointerRef.current.y - cr.top,
    };
    const nonLocked = new Set(
      getCurrentObjects().flatMap((o) => o.locked ? [] : [o.id]),
    );
    const hit = objectIdsAtPoint(stage, point, nonLocked)[0];
    if (hit) {
      if (add) toggleSelectObject(hit);
      else selectObject(hit);
      return;
    }
    if (!add) selectObjects([]);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (previewLocks) return;
    onPanMouseMove(e);
    onLassoMouseMove(e);
  };
  const handleMouseUp = () => {
    if (previewLocks) return;
    onPanMouseUp();
    onLassoMouseUp();
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    if (previewLocks) return;
    onPanMouseDown(e);
  };

  const pointerToLabelDots = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    // Inverse-rotate around label center to map screen -> un-rotated frame.
    const [rx, ry] = inverseRotateDelta(
      clientX - rect.left - labelCenterX,
      clientY - rect.top - labelCenterY,
      viewRotation,
    );
    const px = labelCenterX + rx;
    const py = labelCenterY + ry;
    return {
      x: snap(pxToDots(px - objectsOffsetX, scale, label.dpmm)),
      y: snap(pxToDots(py - labelOffsetY, scale, label.dpmm)),
    };
  };

  useDndMonitor({
    onDragMove(event) {
      if (previewLocks || event.over?.id !== "canvas") {
        setGhost(null);
        return;
      }
      const pos = pointerToLabelDots(lastPointerRef.current.x, lastPointerRef.current.y);
      if (!pos) return;
      const dragData = event.active.data.current as PaletteDragData | undefined;
      const type = dragData?.type;
      if (!type) return;
      const def = getEntry(type);
      if (!def) return;
      setGhost({
        id: "__ghost__",
        type,
        ...pos,
        rotation: 0,
        props: { ...def.defaultProps, ...dragData?.propsOverride },
      } as LeafObject);
    },
    onDragEnd(event) {
      setGhost(null);
      if (previewLocks) return;
      if (event.over?.id !== "canvas") return;
      const pos = pointerToLabelDots(lastPointerRef.current.x, lastPointerRef.current.y);
      if (!pos) return;
      const dragData = event.active.data.current as PaletteDragData | undefined;
      const type = dragData?.type;
      if (!type) return;
      addObject(type, pos, dragData.propsOverride);
    },
    onDragCancel() {
      setGhost(null);
    },
  });

  const { setNodeRef: setDropRef } = useDroppable({ id: "canvas" });

  const mergedRef = useCallback(
    (el: HTMLDivElement | null) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      setDropRef(el);
    },
    [setDropRef],
  );

  return (
    <div
      ref={mergedRef}
      className="w-full h-full relative"
      style={{
        background: colors.canvasBg,
        backgroundImage: `radial-gradient(circle, ${colors.canvasDot} 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
        // Locus-of-attention feedback for preview lock.
        cursor: previewLocks ? 'not-allowed' : cursor,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Loading is DOM (Konva can't render before decode); error is in-canvas. */}
      {previewMode.status === 'loading' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/40 pointer-events-none">
          <span className="font-mono text-[10px] text-muted animate-pulse">
            {t.output.loading}
          </span>
        </div>
      )}
      {previewMode.status === 'error' && (
        <div className="absolute inset-x-0 top-3 z-20 flex justify-center px-3 pointer-events-none">
          <div className="bg-surface border border-amber-500/60 rounded px-3 py-1.5 max-w-md flex items-center gap-3 pointer-events-auto">
            <span className="font-mono text-[10px] text-amber-400 leading-relaxed flex-1">
              {previewMode.error}
            </span>
            <button
              onClick={exitPreviewMode}
              className="font-mono text-[10px] text-muted hover:text-text transition-colors shrink-0"
            >
              {t.app.close}
            </button>
          </div>
        </div>
      )}

      <PaginationControl />

      {label.printOrientation === "I" && (
        <div className="absolute top-3 right-3 z-10 bg-surface border border-border rounded px-2 py-0.5 text-[10px] font-mono text-muted">
          {t.label.printOrientationIndicator}
        </div>
      )}

      {/* Bottom-right controls: view options + zoom */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 bg-surface border border-border rounded px-1 py-0.5">
        <button
          onClick={onGridToggle}
          title="Grid (G)"
          className={`px-2 h-6 rounded text-xs font-mono transition-colors ${showGrid ? "text-accent bg-[--color-accent-dim]" : "text-muted hover:text-text hover:bg-surface-2"}`}
        >
          Grid
        </button>
        <button
          onClick={onSnapToggle}
          title="Snap (S)"
          className={`px-2 h-6 rounded text-xs font-mono transition-colors ${snapEnabled ? "text-accent bg-[--color-accent-dim]" : "text-muted hover:text-text hover:bg-surface-2"}`}
        >
          Snap
        </button>
        <select
          value={snapSizeMm}
          onChange={(e) => onSnapSizeChange(Number(e.target.value))}
          disabled={!snapEnabled}
          className="h-6 rounded px-1 text-xs bg-surface-2 border border-border text-text disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {SNAP_OPTIONS[unit].map((o) => (
            <option key={o.mm} value={o.mm}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="w-px h-3.5 bg-border mx-0.5" />
        <button
          onClick={zoomOut}
          className="w-6 h-6 flex items-center justify-center text-muted hover:text-text font-mono text-sm transition-colors"
        >
          −
        </button>
        <button
          onClick={zoomFit}
          className="font-mono text-[10px] text-muted hover:text-accent w-10 text-center transition-colors"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={zoomIn}
          className="w-6 h-6 flex items-center justify-center text-muted hover:text-text font-mono text-sm transition-colors"
        >
          +
        </button>
        <div className="w-px h-3.5 bg-border mx-0.5" />
        <button
          onClick={rotateView}
          title="Rotate view (R)"
          aria-label="Rotate view"
          className={`w-6 h-6 flex items-center justify-center text-sm transition-colors ${viewRotation !== 0 ? "text-accent" : "text-muted hover:text-text"}`}
        >
          ↻
        </button>
        {viewRotation !== 0 && (
          <span className="font-mono text-[10px] text-accent w-6 text-center">{viewRotation}°</span>
        )}
      </div>
      {containerSize.width > 0 && (
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          onClick={handleStageClick}
          onMouseDown={onStageMouseDown}
          onDragStart={(e) => {
            cancelLasso();
            if (isPanningRef.current) e.target.stopDrag();
          }}
          onDragMove={handleStageDragMove}
          onDragEnd={handleStageDragEnd}
        >
          {/* Object layer */}
          <Layer>
            {/* Pivot at labelCenter; node.x()/y() stays group-local during drags. */}
            <Group
              x={labelCenterX}
              y={labelCenterY}
              rotation={viewRotation}
              offsetX={labelCenterX}
              offsetY={labelCenterY}
            >
              <Rect
                x={labelOffsetX}
                y={labelOffsetY}
                width={labelWidthPx}
                height={labelHeightPx}
                fill="white"
                // Preview: amber glow matches the Labelary-warning palette.
                shadowColor={previewLocks ? 'rgba(251, 191, 36, 0.55)' : 'rgba(0,0,0,0.4)'}
                shadowBlur={previewLocks ? 28 : 12}
                shadowOffsetY={previewLocks ? 0 : 2}
                onClick={() => selectObjects([])}
              />

              {showGrid && (
                <Grid
                  labelOffsetX={labelOffsetX}
                  labelOffsetY={labelOffsetY}
                  labelWidthPx={labelWidthPx}
                  labelHeightPx={labelHeightPx}
                  scale={scale}
                  snapSizeMm={snapSizeMm}
                  colors={colors}
                />
              )}

              {/* Preview replaces editor leaves so user sees the Labelary render at same scale. */}
              {previewLocks ? (
                previewImg && (
                  <KImage
                    image={previewImg}
                    x={labelOffsetX}
                    y={labelOffsetY}
                    width={labelWidthPx}
                    height={labelHeightPx}
                    listening={false}
                  />
                )
              ) : (
                visibleLeaves.map((obj) => (
                  <KonvaObject
                    key={obj.id}
                    obj={obj}
                    scale={scale}
                    dpmm={label.dpmm}
                    offsetX={objectsOffsetX}
                    offsetY={labelOffsetY}
                    isSelected={attachableIds.includes(obj.id)}
                    onSelect={(add) => {
                      // Click child -> select outermost group; lock cascades to handleLockedClick.
                      const target = selectionTargetId(objects, obj.id);
                      const targetObj =
                        target === obj.id ? obj : findObjectById(objects, target);
                      if (targetObj?.locked) handleLockedClick(add);
                      else if (add) toggleSelectObject(target);
                      else selectObject(target);
                    }}
                    onChange={(changes) => handleObjectChange(obj.id, changes)}
                    snap={snap}
                    getOthersSnapshot={snapEnabled ? undefined : getOthersSnapshot}
                    labelRect={transformerSnapLabelRect}
                    setGuides={setGuides}
                  />
                ))
              )}

              {!previewLocks && ghost && (
                <Group opacity={0.5} listening={false}>
                  <KonvaObject
                    obj={ghost}
                    scale={scale}
                    offsetX={objectsOffsetX}
                    offsetY={labelOffsetY}
                    isSelected={false}
                    onSelect={() => { /* ghost */ }}
                    onChange={() => { /* ghost */ }}
                    snap={snap}
                    dpmm={label.dpmm}
                  />
                </Group>
              )}
            </Group>

            {/* Outside the rotation Group; clientRect/Transformer respect parent transforms. */}
            {!previewLocks && lassoRect && (
              <Rect
                x={lassoRect.x}
                y={lassoRect.y}
                width={lassoRect.w}
                height={lassoRect.h}
                fill="rgba(99,102,241,0.08)"
                stroke="#6366f1"
                strokeWidth={1}
                dash={[4, 3]}
                listening={false}
              />
            )}

            {!previewLocks && <GuideLines guides={guides} />}

            {!previewLocks && (
              <Transformer
                ref={transformerRef}
                rotateEnabled={rotateEnabled}
                resizeEnabled={resizeEnabled}
                enabledAnchors={enabledAnchors}
                onTransformStart={onTransformStart}
                boundBoxFunc={boundBoxFunc}
                onTransformEnd={onTransformEnd}
                borderStroke={colors.selection}
                anchorStroke={colors.selection}
                anchorFill="#ffffff"
                anchorSize={7}
                anchorStrokeWidth={1}
                // Stroke-padding drift would surface as 1-dot ZPL jumps.
                ignoreStroke
              />
            )}

            {!previewLocks && rotationBtnPos && (
              <RotationButton
                ref={rotationBtnRef}
                x={rotationBtnPos.x}
                y={rotationBtnPos.y}
                color={colors.selection}
                onClick={handleRotateStep}
              />
            )}
          </Layer>

          {/* Ruler tracks visual edges; labels reverse when axis flips. */}
          <Layer listening={false}>
            <Ruler
              labelOffsetX={visualLabelX}
              labelOffsetY={visualLabelY}
              labelWidthMm={rulerWidthMm}
              labelHeightMm={rulerHeightMm}
              scale={scale}
              canvasWidth={containerSize.width}
              canvasHeight={containerSize.height}
              unit={unit}
              colors={colors}
              horizontalReversed={rulerReversal.horizontal}
              verticalReversed={rulerReversal.vertical}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
});
