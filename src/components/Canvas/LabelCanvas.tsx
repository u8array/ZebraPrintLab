import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  useCallback,
} from "react";
import { useDroppable, useDndMonitor } from "@dnd-kit/core";
import type { PaletteDragData } from "../../dnd/types";
import { Stage, Layer, Group, Image as KImage, Rect, Transformer } from "react-konva";
import type Konva from "konva";
import { useLabelStore, useCurrentObjects, currentObjects, getCurrentObjects, selectPreviewLocksEditor } from "../../store/labelStore";
import { isGroup, getAllLeaves, expandSelection, selectionTargetId, findObjectById, canDeleteSelection, canGroupSelection, canUngroupSelection, isSelectionLocked, type LabelObject } from "../../types/Group";
import { pxToDots, dotsToPx, SCREEN_PX_PER_MM } from "../../lib/coordinates";
import { SNAP_OPTIONS } from "../../lib/units";
import type { Unit } from "../../lib/units";
import { Select } from "../ui/Select";
import type { SnapGuide } from "../../lib/snapGuides";
import { computeAlignDeltas, computeDistribute, computeTidy } from "../../lib/align";
import type { AlignOp, AlignBox, DistributeAxis, AlignRef } from "../../lib/align";
import { objectBoundsDots, selectionUnionDots } from "../../lib/objectBounds";
import { rotateSelectionChanges } from "../../lib/groupRotation";
import { selectTidyTargets } from "../../lib/tidyClassify";
import { safeAreaRectDots } from "../../lib/safeArea";
import { measuredBoundsMap, subscribeMeasuredBounds, getMeasuredSnapshot } from "./measuredBoundsCache";
import { mmToDots } from "../../lib/coordinates";
import { isEditableTarget } from "../../lib/dom";
import { KonvaObject } from "./KonvaObject";
import { CAPTURE_CHROME } from "./konvaObjectProps";
import { Grid } from "./Grid";
import { GuideLines } from "./GuideLines";
import { Ruler, RULER_SIZE } from "./Ruler";
import { getEntry, ObjectRegistry } from "../../registry";
import type { LeafObject } from "../../registry";
import { PALETTE_GROUPS } from "../Palette/paletteGroups";
import { useColorScheme } from "../../lib/useColorScheme";
import { useT } from "../../lib/useT";
import { useCanvasPanZoom } from "./hooks/useCanvasPanZoom";
import { useCanvasLasso } from "./hooks/useCanvasLasso";
import { useKonvaTransformer } from "./hooks/useKonvaTransformer";
import { useKonvaDragController } from "./hooks/useKonvaDragController";
import { PaginationControl } from "./PaginationControl";
import { Tooltip } from "../ui/Tooltip";
import {
  axisReversal,
  inverseRotateDelta,
  isAxisSwapped,
  nextRotation,
  type ViewRotation,
} from "./rotationGeometry";
import { useAltClickCycle } from "./hooks/useAltClickCycle";
import { useSelectionActionBar, actionBarPosition, type BarBounds } from "./hooks/useSelectionActionBar";
import { FloatingCanvasButton, RADIUS as BUTTON_RADIUS, type ButtonTone } from "./FloatingCanvasButton";
import { ROTATE_ICON, TRASH_ICON, LOCK_ICON, UNLOCK_ICON, GROUP_ICON, UNGROUP_ICON } from "./canvasIcons";
import {
  getStepRotation,
  nextZplRotation,
} from "../../registry/rotation";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { buildContextMenu, type MenuSection } from "./canvasActions";
import { zplForSelection } from "../../lib/zplForSelection";
import { generateMultiPageZPL } from "../../lib/zplGenerator";
import { nodeToPngBlob, downloadBlob, copyPngToClipboard } from "../../lib/canvasImage";

/** Object types offered by the context menu's "Add object here". */
// Curated quick-add subset for the context menu, not every registry type; the
// full catalogue lives in the palette.

const PADDING = 40;
// Horizontal stride between action-bar buttons (render-side row layout).
const BUTTON_STEP_PX = 32;

interface RectPx { x: number; y: number; width: number; height: number }
/** Union of two optional rects (px); null only when both are null. */
function unionPx(a: RectPx | null, b: RectPx | null): RectPx | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

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
  alignSelection: (op: AlignOp, ref: AlignRef) => void;
  distributeSelection: (axis: DistributeAxis) => void;
  tidySelection: () => void;
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
  // Action-bar chrome refs live here so the drag onDelta can translate the bar
  // live (its own beforeDraw lags for controller-moved siblings).
  const actionBarRef = useRef<Konva.Group>(null);
  // The view-rotation / label group. The action bar lives outside it (stage
  // coords), so its rest bounds map through this group's transform when rotated;
  // image export also captures it to exclude the transformer / action-bar chrome.
  const rotationGroupRef = useRef<Konva.Group>(null);
  // The white label paper; its drop shadow is dropped during image capture so
  // the PNG is the label rect, not a shadow-padded box.
  const labelPaperRef = useRef<Konva.Rect>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; sections: MenuSection[] } | null>(null);
  const lockedFrameRef = useRef<Konva.Group>(null);
  const dragActiveRef = useRef(false);
  const transformActiveRef = useRef(false);
  const barHalfRef = useRef({ w: 0, h: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  // Reactive view of the measured-footprint cache. The render layer publishes
  // footprints in a post-render effect (barcodes only after their async draw),
  // so reading the snapshot here is what makes the selection frame recompute once
  // they settle, e.g. after a group rotation swaps a barcode's footprint.
  const measuredSnapshot = useSyncExternalStore(subscribeMeasuredBounds, getMeasuredSnapshot);
  const rotateView = () => onViewRotationChange(nextRotation(viewRotation));
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  // Drag-snap guides live in group-local space (rendered inside the rotation
  // group) so they rotate with the view; line-endpoint guides stay in `guides`
  // (stage space, outside the group).
  const [dragGuides, setDragGuides] = useState<SnapGuide[]>([]);
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
    removeSelectedObjects,
    setSelectionLocked,
    groupSelection,
    ungroup,
    copySelectedObjects,
    pasteObjectsAt,
    duplicateSelectedObjects,
    reorderSelection,
    clipboard,
    variables,
    pages,
  } = useLabelStore();
  const objects = useCurrentObjects();
  const paletteFavorites = useLabelStore((s) => s.paletteFavorites);
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
  const attachableIds = useMemo(
    () => expandSelection(objects, selectedIds),
    [objects, selectedIds],
  );
  // Gate the trash glyph on the same predicate removeSelectedObjects uses, so
  // a locked-only selection gets no dead affordance.
  const hasDeletable = canDeleteSelection(objects, selectedIds);

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

  // Safe-area guide rect in screen px (dots scaled, object-offset aligned).
  const safeAreaDots = safeAreaRectDots(label);
  const safeAreaPx = safeAreaDots && {
    x: objectsOffsetX + (safeAreaDots.x / label.dpmm) * scale,
    y: labelOffsetY + (safeAreaDots.y / label.dpmm) * scale,
    width: (safeAreaDots.width / label.dpmm) * scale,
    height: (safeAreaDots.height / label.dpmm) * scale,
  };

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

  // Group frame from selectionUnionDots so it matches the snap borders.
  // Positioned imperatively (no x/y props) so a mid-drag re-render can't reset
  // the live position the controller's onDelta applies. Split into a movable
  // part (follows the drag) and a static part (locked, stays put) so the chrome
  // reflects the real union, not a rigid translate.
  const selectionFrameRef = useRef<Konva.Rect>(null);
  // Movable group sub-outlines share one drag offset.
  const subOutlineGroupRef = useRef<Konva.Group>(null);
  const isMultiFrame = attachableIds.length > 1;
  // One selected group = solid frame (persistent); several picks = dashed (ad-hoc).
  const isMultiSelection = selectedIds.length > 1;
  // Snapshot (not the live map) so the frame derivations recompute when a
  // settled footprint changes; the changing snapshot reference is the signal.
  const frameCtx = { label, measured: measuredSnapshot };
  // Hidden leaves never render, so the old client-rect path ignored them; keep
  // them out of the model-based bounds too.
  // visibleLeaves carries the cascaded (effective) lock; read it, not the raw
  // leaf in `objects`, so a locked group's children count as static here just
  // like the controller skips them.
  const visibleLeafById = new Map(visibleLeaves.map((l) => [l.id, l]));
  const visibleSelIds = attachableIds.filter((id) => visibleLeafById.has(id));
  const movableSelIds = visibleSelIds.filter((id) => !visibleLeafById.get(id)?.locked);
  const staticSelIds = visibleSelIds.filter((id) => !movableSelIds.includes(id));
  const toFramePx = (b: { x: number; y: number; width: number; height: number } | null) =>
    b && {
      x: objectsOffsetX + dotsToPx(b.x, scale, label.dpmm),
      y: labelOffsetY + dotsToPx(b.y, scale, label.dpmm),
      width: dotsToPx(b.width, scale, label.dpmm),
      height: dotsToPx(b.height, scale, label.dpmm),
    };
  // Frame Rect is multi-only; the movable/static bases also drive the action bar
  // (single drags too), so compute them for any selection.
  const hasSelection = visibleSelIds.length > 0;
  const selectionFrameBase = isMultiFrame ? toFramePx(selectionUnionDots(objects, visibleSelIds, frameCtx)) : null;
  const movableFrameBase = hasSelection ? toFramePx(selectionUnionDots(objects, movableSelIds, frameCtx)) : null;
  const staticFrameBase = hasSelection ? toFramePx(selectionUnionDots(objects, staticSelIds, frameCtx)) : null;
  // Sub-outlines mark group members; per group, split visible leaves
  // movable/static (mirrors the main frame).
  const movableGroupRects: { x: number; y: number; width: number; height: number }[] = [];
  const staticGroupRects: typeof movableGroupRects = [];
  if (isMultiSelection) {
    for (const id of selectedIds) {
      const o = findObjectById(objects, id);
      if (!o || !isGroup(o) || o.visible === false) continue;
      const leaves = getAllLeaves(o.children).filter((l) => visibleLeafById.has(l.id));
      const movable = toFramePx(selectionUnionDots(objects, leaves.filter((l) => !visibleLeafById.get(l.id)?.locked).map((l) => l.id), frameCtx));
      const fixed = toFramePx(selectionUnionDots(objects, leaves.filter((l) => visibleLeafById.get(l.id)?.locked).map((l) => l.id), frameCtx));
      if (movable) movableGroupRects.push(movable);
      if (fixed) staticGroupRects.push(fixed);
    }
  }
  // Action-bar bounds: live client-rects during a transformer resize (model
  // commits only at the end), else optical model bounds (matches the drag center).
  // Map group-local bounds into stage coords (identity when unrotated). Single
  // source for the rest position (getBarBounds) and on-drag position (onDelta).
  const barBoundsToStage = (b: BarBounds): BarBounds => {
    const rg = rotationGroupRef.current;
    if (!rg || viewRotation === 0) return b;
    const tf = rg.getAbsoluteTransform();
    const pts = [
      tf.point({ x: b.minX, y: b.minY }),
      tf.point({ x: b.maxX, y: b.minY }),
      tf.point({ x: b.minX, y: b.maxY }),
      tf.point({ x: b.maxX, y: b.maxY }),
    ];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  };

  const getBarBounds = (): BarBounds | null => {
    const stage = stageRef.current;
    if (transformActiveRef.current && stage) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of visibleSelIds) {
        const node = stage.findOne(`#${id}`);
        if (!node) continue;
        const r = node.getClientRect({ relativeTo: stage, skipStroke: true });
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
      }
      return minX === Infinity ? null : { minX, minY, maxX, maxY };
    }
    const u = toFramePx(selectionUnionDots(getCurrentObjects(), visibleSelIds, frameCtx));
    return u
      ? barBoundsToStage({ minX: u.x, minY: u.y, maxX: u.x + u.width, maxY: u.y + u.height })
      : null;
  };
  useLayoutEffect(() => {
    const r = selectionFrameRef.current;
    if (!r || !selectionFrameBase) return;
    r.position({ x: selectionFrameBase.x, y: selectionFrameBase.y });
    r.size({ width: selectionFrameBase.width, height: selectionFrameBase.height });
    // Depend on the geometry primitives, not the freshly-built object, so a
    // mid-drag re-render can't reset the frame the onDelta handler moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectionFrameBase?.x,
    selectionFrameBase?.y,
    selectionFrameBase?.width,
    selectionFrameBase?.height,
  ]);

  // Whole-object drag controller; nodes spread its handlers, Stage captures start.
  const dragController = useKonvaDragController({
    stageRef,
    transformerRef,
    scale,
    dpmm: label.dpmm,
    objectsOffsetX,
    labelOffsetY,
    snapEnabled,
    snapUnitDots: snapUnit,
    setGuides: setDragGuides,
    onDelta: (dx, dy) => {
      // Live union: movable part shifted by the drag, locked part where it sits.
      const moved = movableFrameBase && {
        x: movableFrameBase.x + dx,
        y: movableFrameBase.y + dy,
        width: movableFrameBase.width,
        height: movableFrameBase.height,
      };
      const live = unionPx(moved, staticFrameBase);
      if (!live) return;
      selectionFrameRef.current?.position({ x: live.x, y: live.y });
      selectionFrameRef.current?.size({ width: live.width, height: live.height });
      // Movable sub-outlines follow the drag (reset to 0 on end).
      subOutlineGroupRef.current?.position({ x: dx, y: dy });
      // Shared clamp/flip policy; measure the bar lazily since a drag that selects
      // a new object renders it only after selectObject (absent at drag start).
      const bar = actionBarRef.current;
      const stage = stageRef.current;
      if (bar && stage && dragActiveRef.current && (dx !== 0 || dy !== 0)) {
        if (barHalfRef.current.h === 0) {
          const r = bar.getClientRect({ relativeTo: stage, skipShadow: true });
          barHalfRef.current = { w: r.width / 2, h: r.height / 2 };
        }
        bar.position(
          actionBarPosition(
            // `live` is group-local (the drag delta is in model space); map it to
            // stage coords so the bar tracks the rotated selection on-drag too.
            barBoundsToStage({
              minX: live.x,
              minY: live.y,
              maxX: live.x + live.width,
              maxY: live.y + live.height,
            }),
            barHalfRef.current.w,
            barHalfRef.current.h,
            stage.width(),
            stage.height(),
          ),
        );
      }
    },
  });

  useImperativeHandle(
    ref,
    () => {
      // All in DOTS, so align/distribute is zoom- and view-rotation-independent.
      // A group is one bbox; its delta shifts every leaf (absolute coordinates).
      const buildSelection = (alignRef: AlignRef): {
        boxes: AlignBox[];
        ref: ReturnType<typeof selectionUnionDots>;
        container: NonNullable<ReturnType<typeof selectionUnionDots>>;
        apply: (delta: { id: string; dx: number; dy: number }) => { id: string; changes: { x: number; y: number } }[];
      } | null => {
        const state = useLabelStore.getState();
        const ids = state.selectedIds;
        if (ids.length === 0) return null;
        const objs = currentObjects(state);
        const measured = measuredBoundsMap();
        const ctx = { label: state.label, measured };

        // Locked/hidden objects are non-participants (like drag/nudge/lasso).
        const movable = ids
          .map((id) => findObjectById(objs, id))
          .filter((o): o is LabelObject => o !== undefined && !o.locked && o.visible !== false);
        if (movable.length === 0) return null;

        const labelWDots = mmToDots(state.label.widthMm, state.label.dpmm);
        const labelHDots = mmToDots(state.label.heightMm, state.label.dpmm);
        // Exclude structural primitives (full-label frame, spanning dividers) so
        // they neither inflate the reference nor get rearranged; content only,
        // consistent with tidy. Falls back to all when fewer than 2 content.
        const items = movable.map((o) => ({
          id: o.id,
          type: isGroup(o) ? "group" : o.type,
          box: objectBoundsDots(o, ctx),
        }));
        const contentIds = new Set(selectTidyTargets(items, labelWDots, labelHDots));
        const content = movable.filter((o) => contentIds.has(o.id));
        const contentIdList = content.map((o) => o.id);
        const boxes: AlignBox[] = items
          .filter((it) => contentIds.has(it.id))
          .map((it) => ({ id: it.id, ...it.box }));

        // Align-to-label pins to the safe-area inset when configured, so the
        // 6-edge buttons keep a uniform margin; otherwise the full label rect.
        const labelBox = safeAreaRectDots(state.label) ?? {
          x: 0,
          y: 0,
          width: labelWDots,
          height: labelHDots,
        };
        let refBox: ReturnType<typeof selectionUnionDots>;
        // A single unit (one object or one group) has no meaningful "selection"
        // or "key" frame of its own, so it aligns to the label (Figma: a single
        // element aligns to its parent). Multi-select honors the chosen ref.
        if (alignRef === "label" || content.length === 1) {
          refBox = labelBox;
        } else if (alignRef === "key") {
          const keyObj = content[content.length - 1];
          refBox = keyObj ? objectBoundsDots(keyObj, ctx) : selectionUnionDots(objs, contentIdList, ctx);
        } else {
          refBox = selectionUnionDots(objs, contentIdList, ctx);
        }

        const byId = new Map(content.map((o) => [o.id, o]));
        const apply = (delta: { id: string; dx: number; dy: number }) => {
          const dx = Math.round(delta.dx);
          const dy = Math.round(delta.dy);
          if (dx === 0 && dy === 0) return [];
          const node = byId.get(delta.id);
          if (!node) return [];
          // A group has no own x/y; shift each leaf by the same delta.
          const targets = isGroup(node) ? getAllLeaves(node.children) : [node];
          return targets.map((leaf) => ({
            id: leaf.id,
            changes: { x: leaf.x + dx, y: leaf.y + dy },
          }));
        };

        return { boxes, ref: refBox, container: labelBox, apply };
      };

      return {
        alignSelection: (op: AlignOp, ref: AlignRef) => {
          const sel = buildSelection(ref);
          if (!sel || !sel.ref || sel.boxes.length === 0) return;
          const deltas = computeAlignDeltas(sel.boxes, sel.ref, op);
          const updates = deltas.flatMap(sel.apply);
          if (updates.length > 0) updateObjects(updates);
        },
        // Distribute is inherently selection-relative; ref is fixed.
        distributeSelection: (axis: DistributeAxis) => {
          const sel = buildSelection("selection");
          if (!sel || sel.boxes.length < 3) return;
          const deltas = computeDistribute(sel.boxes, axis, { kind: "equalGap" });
          const updates = deltas.flatMap(sel.apply);
          if (updates.length > 0) updateObjects(updates);
        },
        // Tidy spreads the content across the safe area (else label) and centers
        // it. buildSelection already excludes structural frame/divider primitives.
        tidySelection: () => {
          const sel = buildSelection("selection");
          if (!sel || sel.boxes.length < 2) return;
          const deltas = computeTidy(sel.boxes, sel.container);
          const updates = deltas.flatMap(sel.apply);
          if (updates.length > 0) updateObjects(updates);
        },
      };
    },
    [updateObjects],
  );

  const {
    rotateEnabled,
    resizeEnabled,
    enabledAnchors,
    centeredScaling,
    onTransformStart,
    onTransform,
    boundBoxFunc,
    onTransformEnd,
  } = useKonvaTransformer({
    transformerRef,
    stageRef,
    selectedIds: attachableIds,
    // Cascade-aware leaves so a child of a locked group reads as locked and the
    // transformer detaches (raw leaves would show dead resize handles).
    objects: visibleLeaves,
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
  const allSelectedLocked = isSelectionLocked(objects, selectedIds);

  // Selected leaves whose effective (cascaded) lock is on; each gets an amber
  // outline since the transformer skips locked nodes.
  const lockedLeafIds = useMemo(() => {
    const locked = new Set(
      visibleLeaves.flatMap((l) => (l.locked ? [l.id] : [])),
    );
    return attachableIds.filter((id) => locked.has(id));
  }, [visibleLeaves, attachableIds]);

  useSelectionActionBar({
    stageRef,
    attachableIds,
    lockedLeafIds,
    previewLocks,
    dragActiveRef,
    actionBarRef,
    lockedFrameRef,
    getBarBounds,
  });

  const handleRotateStep = () => {
    if (!singleSelected || !stepRotation) return;
    updateObject(singleSelected.id, {
      props: { rotation: nextZplRotation(stepRotation) },
    });
  };

  // Group / multi-select rotate: one clockwise quarter turn about the union
  // centre, applied as a single batch so undo treats it as one step.
  const canRotateGroup =
    !allSelectedLocked &&
    (selectedIds.length > 1 || (!!singleSelected && isGroup(singleSelected)));
  const handleRotateGroup = () => {
    if (!canRotateGroup) return;
    const changes = rotateSelectionChanges(objects, selectedIds, frameCtx, 1);
    if (changes.size === 0) return;
    updateObjects([...changes].map(([id, c]) => ({ id, changes: c })));
    // Frame recomputes via subscribeMeasuredBounds once children republish.
  };

  // Group when 2+ top-level objects are selectable; ungroup when the selection
  // holds at least one top-level group. Both can be true at once (a group plus
  // a loose object), so both buttons can show.
  const canGroup = selectedIds.length > 1 && canGroupSelection(objects, selectedIds);
  const canUngroup = canUngroupSelection(objects, selectedIds);

  // Contextual action bar. Rotate is a 90-degree step (ZPL only stores N/R/I/B,
  // so a button beats the free-rotation drag handle other tools use). Icons rest
  // neutral and accent on hover; delete is set apart (divider) and destructive
  // (red). The bar itself is gated on !previewLocks at the render site.
  const actionButtons: {
    key: string;
    iconPath: string;
    tone: ButtonTone;
    onClick: () => void;
  }[] = [];
  if (singleSelected && stepRotation && !singleSelected.locked) {
    actionButtons.push({
      key: "rotate",
      iconPath: ROTATE_ICON,
      tone: "neutral",
      onClick: handleRotateStep,
    });
  }
  if (canRotateGroup) {
    actionButtons.push({
      key: "rotate-group",
      iconPath: ROTATE_ICON,
      tone: "neutral",
      onClick: handleRotateGroup,
    });
  }
  if (canGroup) {
    actionButtons.push({
      key: "group",
      iconPath: GROUP_ICON,
      tone: "neutral",
      onClick: groupSelection,
    });
  }
  if (canUngroup) {
    actionButtons.push({
      key: "ungroup",
      iconPath: UNGROUP_ICON,
      tone: "neutral",
      onClick: ungroup,
    });
  }
  if (selectedIds.length > 0) {
    actionButtons.push({
      key: "lock",
      iconPath: allSelectedLocked ? UNLOCK_ICON : LOCK_ICON,
      // Amber while locked to match the locked-state frame.
      tone: allSelectedLocked ? "active" : "neutral",
      onClick: () => setSelectionLocked(!allSelectedLocked),
    });
  }
  if (hasDeletable) {
    actionButtons.push({
      key: "delete",
      iconPath: TRASH_ICON,
      tone: "destructive",
      onClick: removeSelectedObjects,
    });
  }

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

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (previewLocks) return;
    if (consumeDidPan()) return;
    if (consumeDidLasso()) return;
    if (e.target === e.target.getStage()) selectObjects([]);
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

  // PNG of the label paper and its objects only: hide editor chrome (grid,
  // safe-area, selection frames) and drop the view rotation so the image is the
  // canonical label, not the rotated viewport. Restore both afterwards.
  const captureLabelImage = async (): Promise<Blob | null> => {
    const group = rotationGroupRef.current;
    if (!group) return null;
    const chrome = group.find(`.${CAPTURE_CHROME}`);
    const rotation = group.rotation();
    const paper = labelPaperRef.current;
    chrome.forEach((n) => n.visible(false));
    // The paper shadow pads the node bbox; drop it so the PNG crops to the label.
    paper?.shadowEnabled(false);
    group.rotation(0);
    try {
      return await nodeToPngBlob(group);
    } finally {
      chrome.forEach((n) => n.visible(true));
      paper?.shadowEnabled(true);
      group.rotation(rotation);
    }
  };

  const openContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    // No menu during a preview lock; every action would be disabled anyway and
    // we must not mutate the selection behind it.
    if (previewLocks) return;
    const stage = stageRef.current;
    if (!stage) return;
    // Find the object under the click by walking up to the first node whose id
    // is a known object; the white label Rect / stage count as empty.
    let targetId: string | null = null;
    let node: Konva.Node | null = e.target;
    while (node && node !== stage) {
      const id = node.id?.();
      if (id && findObjectById(objects, id)) {
        // Resolve a grouped child to its outermost group, like the drag handler.
        targetId = selectionTargetId(objects, id);
        break;
      }
      node = node.getParent();
    }
    const onObject = targetId !== null;
    // Right-clicking an unselected object selects just it; an already-selected
    // one keeps the (possibly multi) selection.
    if (onObject && targetId && !selectedIds.includes(targetId)) selectObject(targetId);
    const sel =
      targetId && !selectedIds.includes(targetId) ? [targetId] : selectedIds;
    const click = pointerToLabelDots(e.evt.clientX, e.evt.clientY) ?? { x: 0, y: 0 };
    const dispatch = {
      copy: copySelectedObjects,
      cut: () => {
        copySelectedObjects();
        removeSelectedObjects();
      },
      duplicate: duplicateSelectedObjects,
      remove: removeSelectedObjects,
      pasteHere: () => pasteObjectsAt(click.x, click.y),
      reorder: reorderSelection,
      group: groupSelection,
      ungroup,
      toggleLock: () => setSelectionLocked(!isSelectionLocked(objects, sel)),
      addHere: (type: string) => addObject(type, click),
      copyZplSelected: () => {
        void navigator.clipboard?.writeText(zplForSelection(label, objects, sel, variables));
      },
      copyZplLabel: () => {
        void navigator.clipboard?.writeText(generateMultiPageZPL(label, pages, variables));
      },
      copyImage: () => {
        // Call write synchronously with the pending blob so the user activation
        // survives the async capture. Unsupported / failure stays a silent no-op.
        const blob = captureLabelImage().then((b) => {
          if (!b) throw new Error("capture-failed");
          return b;
        });
        void copyPngToClipboard(blob).catch(() => undefined);
      },
      exportImage: async () => {
        const blob = await captureLabelImage();
        if (blob) downloadBlob(blob, "label.png");
      },
      selectAll: () => selectObjects(objects.map((o) => o.id)),
    };
    // Add-here mirrors the palette: favorites first (when pinned), then the
    // registry groups in palette order. Empty groups drop out.
    const typeLabel = (type: string) =>
      (t.types as Record<string, string>)[type] ?? getEntry(type)?.label ?? type;
    const typesInGroup = (key: string) =>
      Object.entries(ObjectRegistry)
        .filter(([, def]) => def.group === key)
        .map(([type]) => ({ type, label: typeLabel(type) }));
    const favTypes = paletteFavorites
      .filter((type) => getEntry(type))
      .map((type) => ({ type, label: typeLabel(type) }));
    const addableGroups = [
      ...(favTypes.length ? [{ id: "favorites", label: t.palette.favorites, types: favTypes }] : []),
      ...PALETTE_GROUPS.map((g) => ({ id: g.key, label: t.palette[g.labelKey], types: typesInGroup(g.key) })),
    ].filter((g) => g.types.length > 0);
    const sections = buildContextMenu({
      onObject,
      hasSelection: sel.length > 0,
      canGroup: sel.length > 1 && canGroupSelection(objects, sel),
      canUngroup: canUngroupSelection(objects, sel),
      canDelete: canDeleteSelection(objects, sel),
      locked: isSelectionLocked(objects, sel),
      hasClipboard: clipboard.length > 0,
      hasObjects: objects.length > 0,
      previewLocks,
      addableGroups,
      dispatch,
    });
    setCtxMenu({ x: e.evt.clientX, y: e.evt.clientY, sections });
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
        <Tooltip content={`${t.app.toggleGrid} (G)`}>
          <button
            onClick={onGridToggle}
            className={`px-2 h-6 rounded text-xs font-mono transition-colors ${showGrid ? "text-accent bg-[--color-accent-dim]" : "text-muted hover:text-text hover:bg-surface-2"}`}
          >
            {t.app.toggleGrid}
          </button>
        </Tooltip>
        <Tooltip content={`${t.app.toggleSnap} (S)`}>
          <button
            onClick={onSnapToggle}
            className={`px-2 h-6 rounded text-xs font-mono transition-colors ${snapEnabled ? "text-accent bg-[--color-accent-dim]" : "text-muted hover:text-text hover:bg-surface-2"}`}
          >
            {t.app.toggleSnap}
          </button>
        </Tooltip>
        <div className="w-28">
          <Select<number>
            value={snapSizeMm}
            onChange={(value) => onSnapSizeChange(value)}
            disabled={!snapEnabled}
            groups={[
              {
                options: SNAP_OPTIONS[unit].map((o) => ({ value: o.mm, label: o.label })),
              },
            ]}
          />
        </div>
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
        <Tooltip content={`${t.app.rotateView} (R)`}>
          {/* Degree readout lives inside the button so the whole chip is one
              click target, not just the arrow with a separate label beside it. */}
          <button
            onClick={rotateView}
            aria-label={t.app.rotateView}
            className={`h-6 px-1.5 flex items-center justify-center gap-1 text-sm transition-colors ${viewRotation !== 0 ? "text-accent" : "text-muted hover:text-text"}`}
          >
            <span>↻</span>
            {viewRotation !== 0 && (
              <span className="font-mono text-[10px]">{viewRotation}°</span>
            )}
          </button>
        </Tooltip>
      </div>
      {containerSize.width > 0 && (
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          onClick={handleStageClick}
          onContextMenu={openContextMenu}
          onMouseDown={onStageMouseDown}
          onDragStart={(e) => {
            cancelLasso();
            if (isPanningRef.current) {
              e.target.stopDrag();
              return;
            }
            // Dragging a non-selected object selects it first, so the chrome
            // (group frame, action bar) tracks what actually moves instead of
            // sticking to the prior selection.
            const id = e.target.id();
            const objs = getCurrentObjects();
            if (id && findObjectById(objs, id)) {
              const target = selectionTargetId(objs, id);
              if (!useLabelStore.getState().selectedIds.includes(target)) selectObject(target);
            }
            dragController.onDragStart(e);
            // onDelta drives/measures the bar (its beforeDraw lags); reset its
            // size so onDelta re-measures fresh for this selection.
            dragActiveRef.current = !!id && !!findObjectById(getCurrentObjects(), id);
            barHalfRef.current = { w: 0, h: 0 };
          }}
          onDragEnd={() => {
            dragActiveRef.current = false;
          }}
        >
          {/* Object layer */}
          <Layer>
            {/* Pivot at labelCenter; node.x()/y() stays group-local during drags. */}
            <Group
              ref={rotationGroupRef}
              x={labelCenterX}
              y={labelCenterY}
              rotation={viewRotation}
              offsetX={labelCenterX}
              offsetY={labelCenterY}
            >
              <Rect
                ref={labelPaperRef}
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

              {/* Safe-area guide: non-interactive dashed inset, accent like the ^FB wrap-guide. */}
              {!previewLocks && safeAreaPx && (
                <Rect
                  name={CAPTURE_CHROME}
                  x={safeAreaPx.x}
                  y={safeAreaPx.y}
                  width={safeAreaPx.width}
                  height={safeAreaPx.height}
                  stroke={colors.accent}
                  strokeWidth={1}
                  dash={[4, 3]}
                  listening={false}
                />
              )}

              {showGrid && (
                <Group name={CAPTURE_CHROME} listening={false}>
                  <Grid
                    labelOffsetX={labelOffsetX}
                    labelOffsetY={labelOffsetY}
                    labelWidthPx={labelWidthPx}
                    labelHeightPx={labelHeightPx}
                    scale={scale}
                    snapSizeMm={snapSizeMm}
                    colors={colors}
                  />
                </Group>
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
                      // Click child -> select outermost group. Locked objects
                      // are selectable so the action bar's unlock is reachable;
                      // the lock guard still blocks any move/transform.
                      const target = selectionTargetId(objects, obj.id);
                      if (add) toggleSelectObject(target);
                      else selectObject(target);
                    }}
                    onChange={(changes) => handleObjectChange(obj.id, changes)}
                    snap={snap}
                    dragHandlers={dragController.nodeDragHandlers}
                    registerMover={dragController.registerMover}
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

              {/* Multi-select/group frame from model bounds (matches snap borders);
                  positioned imperatively in useLayoutEffect + the drag onDelta. */}
              {!previewLocks && selectionFrameBase && (
                <Rect
                  ref={selectionFrameRef}
                  name={CAPTURE_CHROME}
                  stroke={allSelectedLocked ? colors.accent : colors.selection}
                  strokeWidth={1.5}
                  dash={isMultiSelection || allSelectedLocked ? [6, 4] : undefined}
                  listening={false}
                />
              )}

              {/* Box per group member: movable parts (blue) drag; locked parts
                  (amber, the locked convention) stay put. */}
              {!previewLocks && movableGroupRects.length > 0 && (
                <Group ref={subOutlineGroupRef} name={CAPTURE_CHROME} listening={false}>
                  {movableGroupRects.map((r, i) => (
                    <Rect
                      key={i}
                      x={r.x}
                      y={r.y}
                      width={r.width}
                      height={r.height}
                      stroke={colors.selection}
                      strokeWidth={1}
                      listening={false}
                    />
                  ))}
                </Group>
              )}
              {!previewLocks && staticGroupRects.length > 0 && (
                <Group name={CAPTURE_CHROME} listening={false}>
                  {staticGroupRects.map((r, i) => (
                    <Rect
                      key={i}
                      x={r.x}
                      y={r.y}
                      width={r.width}
                      height={r.height}
                      stroke={colors.accent}
                      strokeWidth={1}
                      dash={[6, 4]}
                      listening={false}
                    />
                  ))}
                </Group>
              )}

              {/* Drag-snap guides: group-local, so they rotate with the view. */}
              {!previewLocks && <GuideLines guides={dragGuides} />}
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
                centeredScaling={centeredScaling}
                onTransformStart={() => {
                  transformActiveRef.current = true;
                  onTransformStart();
                }}
                onTransform={onTransform}
                boundBoxFunc={boundBoxFunc}
                onTransformEnd={() => {
                  try {
                    onTransformEnd();
                  } finally {
                    transformActiveRef.current = false;
                  }
                }}
                borderStroke={colors.selection}
                anchorStroke={colors.selection}
                anchorFill="#ffffff"
                anchorSize={7}
                anchorStrokeWidth={1}
                // Stroke-padding drift would surface as 1-dot ZPL jumps.
                ignoreStroke
              />
            )}

            {!previewLocks && lockedLeafIds.length > 0 && (
              <Group ref={lockedFrameRef}>
                {lockedLeafIds.map((id) => (
                  <Rect
                    key={id}
                    stroke={colors.accent}
                    strokeWidth={1.5}
                    dash={[4, 3]}
                    listening={false}
                  />
                ))}
              </Group>
            )}

            {!previewLocks && attachableIds.length > 0 && actionButtons.length > 0 && (
              <Group ref={actionBarRef}>
                {(() => {
                  const n = actionButtons.length;
                  const w = (n - 1) * BUTTON_STEP_PX + 2 * BUTTON_RADIUS + 16;
                  const h = 2 * BUTTON_RADIUS + 8;
                  // Divider sits just left of the delete button to set it apart.
                  const deleteIndex = actionButtons.findIndex((b) => b.key === "delete");
                  const dividerX =
                    deleteIndex > 0
                      ? (deleteIndex - (n - 1) / 2) * BUTTON_STEP_PX - BUTTON_STEP_PX / 2
                      : null;
                  return (
                    <>
                      {/* Opaque pill (not alpha) so icons stay legible over busy
                          content; flat hairline matches the rest of the canvas
                          chrome (no shadow). Amber while the selection is locked. */}
                      <Rect
                        x={-w / 2}
                        y={-h / 2}
                        width={w}
                        height={h}
                        cornerRadius={h / 2}
                        fill={colors.surface}
                        stroke={allSelectedLocked ? colors.accent : colors.selection}
                        strokeWidth={1}
                      />
                      {dividerX !== null && (
                        <Rect
                          x={dividerX}
                          y={-h / 2 + 5}
                          width={1}
                          height={h - 10}
                          fill={colors.border}
                        />
                      )}
                    </>
                  );
                })()}
                {actionButtons.map((b, i) => (
                  <Group
                    key={b.key}
                    x={(i - (actionButtons.length - 1) / 2) * BUTTON_STEP_PX}
                  >
                    <FloatingCanvasButton
                      tone={b.tone}
                      onClick={b.onClick}
                      iconPath={b.iconPath}
                    />
                  </Group>
                ))}
              </Group>
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
      {ctxMenu && (
        <CanvasContextMenu
          sections={ctxMenu.sections}
          x={ctxMenu.x}
          y={ctxMenu.y}
          labels={t.contextMenu as unknown as Record<string, string>}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
});
