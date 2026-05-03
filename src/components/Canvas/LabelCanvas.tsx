import {
  useRef,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useDroppable, useDndMonitor } from "@dnd-kit/core";
import type { PaletteDragData } from "../../dnd/types";
import { Stage, Layer, Group, Rect, Transformer } from "react-konva";
import type Konva from "konva";
import { useLabelStore } from "../../store/labelStore";
import { pxToDots, SCREEN_PX_PER_MM } from "../../lib/coordinates";
import { SNAP_OPTIONS } from "../../lib/units";
import type { Unit } from "../../lib/units";
import { computeSnap } from "../../lib/snapGuides";
import type { SnapGuide } from "../../lib/snapGuides";
import { KonvaObject } from "./KonvaObject";
import { Grid } from "./Grid";
import { GuideLines } from "./GuideLines";
import { Ruler, RULER_SIZE } from "./Ruler";
import { ObjectRegistry } from "../../registry";
import type { LabelObject } from "../../registry";
import { useColorScheme } from "../../lib/useColorScheme";
import { useCanvasPanZoom } from "./hooks/useCanvasPanZoom";
import { useCanvasLasso } from "./hooks/useCanvasLasso";
import { useKonvaTransformer } from "./hooks/useKonvaTransformer";
import {
  axisReversal,
  inverseRotateDelta,
  isAxisSwapped,
  nextRotation,
  type ViewRotation,
} from "./rotationGeometry";

const PADDING = 40;

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

export function LabelCanvas({
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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const rotateView = () => onViewRotationChange(nextRotation(viewRotation));
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [ghost, setGhost] = useState<LabelObject | null>(null);

  // Raw pointer position tracked independently of @dnd-kit's scroll-adjusted delta.
  // activatorEvent.client + event.delta includes scroll momentum from the palette
  // sidebar, which causes a proportional drop-position offset on touch devices.
  const lastPointerRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  const colors = useColorScheme();

  const {
    label,
    objects,
    selectedIds,
    addObject,
    updateObject,
    updateObjects,
    selectObject,
    toggleSelectObject,
    selectObjects,
  } = useLabelStore();

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

  // Delete/Backspace removes all selected objects; ignored when focus is inside an input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Delete" && e.code !== "Backspace") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
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

      const { selectedIds: ids, objects: objs } = useLabelStore.getState();
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
      // Map the visual screen direction to label coordinates so arrow keys
      // always move the object the way the user sees it on the rotated view.
      const [dx, dy] = inverseRotateDelta(screenDx, screenDy, viewRotation);

      updateObjects(
        ids.flatMap((sid) => {
          const obj = objs.find((o) => o.id === sid);
          return obj ? [{ id: sid, changes: { x: obj.x + dx, y: obj.y + dy } }] : [];
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

  // zoom=1 → 100% → physical label size on screen (96 dpi CSS convention).
  // fitZoom is the multiplier that makes the visually-rotated label fill the
  // container, so axes swap at 90°/270°.
  const axisSwapped = isAxisSwapped(viewRotation);
  const fitWidthMm = axisSwapped ? label.heightMm : effectiveWidthMm;
  const fitHeightMm = axisSwapped ? effectiveWidthMm : label.heightMm;
  const fitZoom = usableWidth > 0 && usableHeight > 0
    ? Math.min(
        (usableWidth - PADDING * 2) / (fitWidthMm * SCREEN_PX_PER_MM),
        (usableHeight - PADDING * 2) / (fitHeightMm * SCREEN_PX_PER_MM),
      )
    : 1;

  // On first mount (once container dimensions are known), initialize zoom to
  // fit so the label is immediately visible regardless of persisted zoom value.
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

  const {
    lasso: lassoRect,
    consumeDidLasso,
    cancelLasso,
    onMouseMove: onLassoMouseMove,
    onMouseUp: onLassoMouseUp,
    onStageMouseDown,
  } = useCanvasLasso({ containerRef, stageRef, spaceDown, selectObjects });

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
    selectedIds,
    objects,
    scale,
    dpmm: label.dpmm,
    objectsOffsetX,
    labelOffsetY,
    snap,
    updateObject,
  });

  const handleObjectChange = (
    id: string,
    changes: Parameters<typeof updateObject>[1],
  ) => {
    const finalChanges = {
      ...changes,
      ...(changes.x !== undefined && { x: snap(changes.x) }),
      ...(changes.y !== undefined && { y: snap(changes.y) }),
    };
    // Multi-select: propagate position delta to all other selected objects.
    // Read fresh state (getState) to avoid stale closure when multiple DragEnd events
    // fire simultaneously during a Transformer group drag.
    const { selectedIds: selIds, objects: currentObjs } = useLabelStore.getState();
    if (
      selIds.length > 1 &&
      selIds.includes(id) &&
      (finalChanges.x !== undefined || finalChanges.y !== undefined)
    ) {
      const srcObj = currentObjs.find((o) => o.id === id);
      if (srcObj) {
        const ddx = finalChanges.x !== undefined ? finalChanges.x - srcObj.x : 0;
        const ddy = finalChanges.y !== undefined ? finalChanges.y - srcObj.y : 0;
        updateObjects([
          { id, changes: finalChanges },
          ...selIds
            .filter((sid) => sid !== id)
            .flatMap((sid) => {
              const other = currentObjs.find((o) => o.id === sid);
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

    const { objects: objs } = useLabelStore.getState();
    const obj = objs.find((o) => o.id === objId);
    if (!obj) return;

    const stage = stageRef.current;
    const dr = node.getClientRect({ relativeTo: stage });
    const draggedRect = { id: objId, x: dr.x, y: dr.y, width: dr.width, height: dr.height };

    const otherRects = [];
    for (const o of objs) {
      if (o.id === objId) continue;
      const n = stage.findOne<Konva.Node>(`#${o.id}`);
      if (!n) continue;
      const r = n.getClientRect({ relativeTo: stage });
      otherRects.push({ id: o.id, x: r.x, y: r.y, width: r.width, height: r.height });
    }

    // Snap operates in stage (screen) space — getClientRect on rotated
    // children already accounts for the Group transform, so the label rect
    // must use visual bounds (not un-rotated labelOffset*).
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
    // result is in screen space; node.position() is in group-local space, so
    // the delta needs inverse-rotation back into the un-rotated frame.
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
    if (consumeDidPan()) return;
    if (consumeDidLasso()) return;
    if (e.target === e.target.getStage()) selectObjects([]);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    onPanMouseMove(e);
    onLassoMouseMove(e);
  };
  const handleMouseUp = () => {
    onPanMouseUp();
    onLassoMouseUp();
  };

  const pointerToLabelDots = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    // Inverse-rotate the pointer around the label center so screen-space
    // input maps back into the un-rotated label coordinate frame.
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
      if (event.over?.id !== "canvas") {
        setGhost(null);
        return;
      }
      const pos = pointerToLabelDots(lastPointerRef.current.x, lastPointerRef.current.y);
      if (!pos) return;
      const type = (event.active.data.current as PaletteDragData | undefined)?.type;
      if (!type) return;
      const def = ObjectRegistry[type];
      if (!def) return;
      setGhost({ id: "__ghost__", type, ...pos, rotation: 0, props: def.defaultProps } as LabelObject);
    },
    onDragEnd(event) {
      setGhost(null);
      if (event.over?.id !== "canvas") return;
      const pos = pointerToLabelDots(lastPointerRef.current.x, lastPointerRef.current.y);
      if (!pos) return;
      const type = (event.active.data.current as PaletteDragData | undefined)?.type;
      if (!type) return;
      addObject(type, pos);
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
        cursor,
      }}
      onMouseDown={onPanMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
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
            {/*
             * Rotation pivot: x=offsetX=labelCenterX. At 0° this collapses to
             * the identity (group-local = screen), and onTransformEnd stays
             * valid because Konva keeps node.x()/y() in the group's local
             * (un-rotated) frame during drags. Pointer input (pointerToLabelDots)
             * is inverse-rotated explicitly since it bypasses Konva.
             */}
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
                shadowColor="rgba(0,0,0,0.4)"
                shadowBlur={12}
                shadowOffsetY={2}
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

              {objects.map((obj) => (
                <KonvaObject
                  key={obj.id}
                  obj={obj}
                  scale={scale}
                  dpmm={label.dpmm}
                  offsetX={objectsOffsetX}
                  offsetY={labelOffsetY}
                  isSelected={selectedIds.includes(obj.id)}
                  onSelect={(add) =>
                    add ? toggleSelectObject(obj.id) : selectObject(obj.id)
                  }
                  onChange={(changes) => handleObjectChange(obj.id, changes)}
                  snap={snap}
                />
              ))}

              {ghost && (
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

            {/* Lasso, guides and Transformer live in screen space outside
                the Group. Lasso intersection uses getClientRect which
                respects the rotation; snap guides come from computeSnap in
                stage pixels; the Transformer follows nodes through their
                accumulated parent transform. */}
            {lassoRect && (
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

            <GuideLines guides={guides} />

            <Transformer
              ref={transformerRef}
              rotateEnabled={rotateEnabled}
              resizeEnabled={resizeEnabled}
              enabledAnchors={enabledAnchors}
              onTransformStart={onTransformStart}
              boundBoxFunc={boundBoxFunc}
              onTransformEnd={onTransformEnd}
            />
          </Layer>

          {/* Ruler — topmost layer. Tracks the visually-rotated label edges;
              labels are reversed when the corresponding axis flips. */}
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
}
