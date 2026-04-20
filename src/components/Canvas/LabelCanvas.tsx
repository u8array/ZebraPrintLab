import { useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
import { useDroppable, useDndMonitor } from "@dnd-kit/core";
import type { PaletteDragData } from "../../dnd/types";
import { Stage, Layer, Group, Rect, Transformer } from "react-konva";
import type Konva from "konva";
import { useLabelStore } from "../../store/labelStore";
import { pxToDots } from "../../lib/coordinates";
import { SNAP_OPTIONS } from "../../lib/units";
import type { Unit } from "../../lib/units";
import { computeSnap } from "../../lib/snapGuides";
import type { SnapGuide } from "../../lib/snapGuides";
import { KonvaObject } from "./KonvaObject";
import { Grid } from "./Grid";
import { GuideLines } from "./GuideLines";
import { Ruler, RULER_SIZE } from "./Ruler";
import { ObjectRegistry, BARCODE_1D_TYPES } from "../../registry";
import type { LabelObject } from "../../registry";
import { useColorScheme } from "../../lib/useColorScheme";

const PADDING = 40;
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

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
}

export function LabelCanvas({ unit, showGrid, onGridToggle, snapEnabled, onSnapToggle, snapSizeMm, onSnapSizeChange, zoom, onZoomChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
  // track whether the pointer actually moved during a pan gesture
  const didPanRef = useRef(false);

  const [guides, setGuides] = useState<SnapGuide[]>([]);

  // Lasso (marquee) selection
  const [lasso, setLasso] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const lassoRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const lassoStartRef = useRef<{ x: number; y: number } | null>(null);
  const didLassoRef = useRef(false);

  // Ghost object shown while dragging any object from the palette
  const [ghost, setGhost] = useState<LabelObject | null>(null);

  // Raw pointer position tracked independently of @dnd-kit's scroll-adjusted delta.
  // activatorEvent.client + event.delta includes scroll momentum from the palette
  // sidebar, which causes a proportional drop-position offset on touch devices.
  const lastPointerRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => { lastPointerRef.current = { x: e.clientX, y: e.clientY }; };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, []);

  const zoomIn  = () => onZoomChange(ZOOM_STEPS.find(s => s > zoom) ?? ZOOM_MAX);
  const zoomOut = () => onZoomChange([...ZOOM_STEPS].reverse().find(s => s < zoom) ?? ZOOM_MIN);
  const zoomFit = () => {
    onZoomChange(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const colors = useColorScheme();

  const { label, objects, selectedIds, addObject, updateObject, selectObject, toggleSelectObject, selectObjects } =
    useLabelStore();

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

  // keep stable refs so the passive:false wheel listener can read current values
  const zoomRef = useRef(zoom);
  const onZoomChangeRef = useRef(onZoomChange);
  useLayoutEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useLayoutEffect(() => { onZoomChangeRef.current = onZoomChange; }, [onZoomChange]);

  // non-passive wheel: ctrl+scroll → zoom, plain scroll → pan
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        onZoomChangeRef.current(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current * (e.deltaY < 0 ? 1.1 : 0.9))));
      } else {
        setPanOffset((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // space key toggles the grab cursor and enables space+drag panning
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Delete/Backspace removes all selected objects; ignored when focus is inside an input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Delete' && e.code !== 'Backspace') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const { selectedIds: ids } = useLabelStore.getState();
      if (ids.length === 0) return;
      e.preventDefault();
      useLabelStore.getState().removeSelectedObjects();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
      const step = e.shiftKey ? label.dpmm * 10 : snapEnabled ? Math.round(snapSizeMm * label.dpmm) : 1;
      const dx =
        e.code === "ArrowRight" ? step : e.code === "ArrowLeft" ? -step : 0;
      const dy =
        e.code === "ArrowDown" ? step : e.code === "ArrowUp" ? -step : 0;

      ids.forEach((sid) => {
        const obj = objs.find((o) => o.id === sid);
        if (obj) updateObject(sid, { x: obj.x + dx, y: obj.y + dy });
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [snapEnabled, snapSizeMm, label.dpmm, updateObject]);

  // Object-snap: applied after grid-snap on every dragmove, single-object only.
  // Fires on the Stage so it sees the already-grid-snapped node position.
  // Defined as a plain function (same as handleStageClick) — closure reads current values.
  const handleStageDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (snapEnabled) return;
    const node = e.target;
    const objId = node.id();
    if (!objId || !stageRef.current) return;

    const { objects: objs } = useLabelStore.getState();

    const obj = objs.find(o => o.id === objId);
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

    // Add the label itself as a full-size snap target.
    // This gives 3 anchors per axis: edge-start, center, edge-end.
    // Passed separately so it doesn't interfere with object-to-object snap filtering.
    const labelRect = { id: '_lbl', x: labelOffsetX, y: labelOffsetY, width: labelWidthPx, height: labelHeightPx };

    const result = computeSnap(draggedRect, otherRects, undefined, {
      x: labelOffsetX, y: labelOffsetY, width: labelWidthPx, height: labelHeightPx,
    }, labelRect);
    const dx = result.x - dr.x;
    const dy = result.y - dr.y;
    if (dx !== 0 || dy !== 0) {
      node.position({ x: node.x() + dx, y: node.y() + dy });
    }
    setGuides(result.guides);
  };

  const handleStageDragEnd = () => {
    setGuides([]);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const isMiddle = e.button === 1;
    const isSpaceDrag = e.button === 0 && spaceDown;
    if (!isMiddle && !isSpaceDrag) return;
    e.preventDefault();
    isPanningRef.current = true;
    setIsPanning(true);
    didPanRef.current = false;
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: panOffset.x,
      panY: panOffset.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Panning
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didPanRef.current = true;
      setPanOffset({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
    }
    // Lasso
    if (lassoStartRef.current && containerRef.current) {
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
    }
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;
    setIsPanning(false);
    if (!lassoStartRef.current) return;
    lassoStartRef.current = null;
    const rect = lassoRectRef.current;
    lassoRectRef.current = null;
    setLasso(null);
    if (!rect || !stageRef.current) return;
    const stage = stageRef.current;
    const selected = useLabelStore.getState().objects
      .filter((obj) => {
        const node = stage.findOne<Konva.Node>(`#${obj.id}`);
        if (!node) return false;
        const box = node.getClientRect({ relativeTo: stage });
        return (
          rect.x < box.x + box.width && rect.x + rect.w > box.x &&
          rect.y < box.y + box.height && rect.y + rect.h > box.y
        );
      })
      .map((obj) => obj.id);
    selectObjects(selected);
  };

  // usable area after reserving space for the ruler
  const usableWidth = containerSize.width - RULER_SIZE;
  const usableHeight = containerSize.height - RULER_SIZE;

  // ^LS shifts all content to the right by labelShift dots. The label rect
  // grows by that amount so the shifted content is fully visible. Scale and
  // centering use the original widthMm so zoom level stays stable.
  const labelShiftMm = (label.labelShift ?? 0) / label.dpmm;
  const effectiveWidthMm = label.widthMm + labelShiftMm;

  const scaleX =
    usableWidth > 0 ? (usableWidth - PADDING * 2) / effectiveWidthMm : 1;
  const scaleY =
    usableHeight > 0 ? (usableHeight - PADDING * 2) / label.heightMm : 1;
  const scale = Math.min(scaleX, scaleY) * zoom;

  const labelWidthPx = effectiveWidthMm * scale;
  const labelHeightPx = label.heightMm * scale;
  const labelOffsetX =
    RULER_SIZE + (usableWidth - labelWidthPx) / 2 + panOffset.x;

  // Objects are shifted right by labelShift so they appear where ^LS places them.
  const labelShiftPx = labelShiftMm * scale;
  const objectsOffsetX = labelOffsetX + labelShiftPx;
  const labelOffsetY =
    RULER_SIZE + (usableHeight - labelHeightPx) / 2 + panOffset.y;


  const snapUnit = Math.round(snapSizeMm * label.dpmm);
  const snap = (dots: number) =>
    snapEnabled ? Math.round(dots / snapUnit) * snapUnit : dots;

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
    if (selIds.length > 1 && selIds.includes(id) && (finalChanges.x !== undefined || finalChanges.y !== undefined)) {
      const srcObj = currentObjs.find((o) => o.id === id);
      if (srcObj) {
        const ddx = finalChanges.x !== undefined ? finalChanges.x - srcObj.x : 0;
        const ddy = finalChanges.y !== undefined ? finalChanges.y - srcObj.y : 0;
        selIds.forEach((sid) => {
          if (sid === id) return;
          const other = currentObjs.find((o) => o.id === sid);
          if (other) updateObject(sid, { x: other.x + ddx, y: other.y + ddy });
        });
      }
    }
    updateObject(id, finalChanges);
  };

  // Sync transformer selection whenever selected objects or object list changes
  // Lines use their own endpoint handle — skip the transformer for them
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    if (selectedIds.length === 0) {
      transformerRef.current.nodes([]);
      return;
    }
    if (selectedIds.length === 1) {
      const selectedObj = objects.find((o) => o.id === selectedIds[0]);
      const useTransformer = selectedObj && selectedObj.type !== 'line';
      const node = useTransformer
        ? stageRef.current.findOne<Konva.Node>(`#${selectedIds[0]}`)
        : null;
      transformerRef.current.nodes(node ? [node] : []);
    } else {
      const nodes = selectedIds
        .filter((id) => objects.find((o) => o.id === id)?.type !== 'line')
        .map((id) => stageRef.current?.findOne<Konva.Node>(`#${id}`))
        .filter((n): n is Konva.Node => n != null);
      transformerRef.current.nodes(nodes);
    }
  }, [selectedIds, objects]);

  const { setNodeRef: setDropRef } = useDroppable({ id: 'canvas' });

  const pointerToLabelDots = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return {
      x: snap(pxToDots(px - objectsOffsetX, scale, label.dpmm)),
      y: snap(pxToDots(py - labelOffsetY, scale, label.dpmm)),
    };
  };

  useDndMonitor({
    onDragMove(event) {
      if (event.over?.id !== 'canvas') { setGhost(null); return; }
      const pos = pointerToLabelDots(lastPointerRef.current.x, lastPointerRef.current.y);
      if (!pos) return;
      const type = (event.active.data.current as PaletteDragData | undefined)?.type;
      if (!type) return;
      const def = ObjectRegistry[type];
      if (!def) return;
      setGhost({ id: '__ghost__', type, ...pos, rotation: 0, props: def.defaultProps } as LabelObject);
    },
    onDragEnd(event) {
      setGhost(null);
      if (event.over?.id !== 'canvas') return;
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

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0 || spaceDown) return;
    const targetId = e.target.id();
    // Only start lasso on background (stage or label surface, not on an object)
    const onObject = useLabelStore.getState().objects.some((o) => o.id === targetId);
    if (onObject || e.target.getParent()?.className === 'Transformer') return;
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;
    lassoStartRef.current = pos;
    didLassoRef.current = false;
  };


  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // suppress deselection after pan or lasso
    if (didPanRef.current) { didPanRef.current = false; return; }
    if (didLassoRef.current) { didLassoRef.current = false; return; }
    if (e.target === e.target.getStage()) selectObjects([]);
  };

  const cursor = isPanning ? "grabbing" : spaceDown ? "grab" : undefined;

  const mergedRef = useCallback((el: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    setDropRef(el);
  }, [setDropRef]);

  return (
    <div
      ref={mergedRef}
      className="w-full h-full relative"
      style={{
        background: colors.canvasBg,
        backgroundImage:
          `radial-gradient(circle, ${colors.canvasDot} 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
        cursor,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Bottom-right controls: view options + zoom */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 bg-surface border border-border rounded px-1 py-0.5">
        <button
          onClick={onGridToggle}
          title="Grid (G)"
          className={`px-2 h-6 rounded text-xs font-mono transition-colors ${showGrid ? 'text-accent bg-[--color-accent-dim]' : 'text-muted hover:text-text hover:bg-surface-2'}`}
        >
          Grid
        </button>
        <button
          onClick={onSnapToggle}
          title="Snap (S)"
          className={`px-2 h-6 rounded text-xs font-mono transition-colors ${snapEnabled ? 'text-accent bg-[--color-accent-dim]' : 'text-muted hover:text-text hover:bg-surface-2'}`}
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
            <option key={o.mm} value={o.mm}>{o.label}</option>
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
      </div>
      {containerSize.width > 0 && (
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          onClick={handleStageClick}
          onMouseDown={handleStageMouseDown}
          onDragStart={(e) => { lassoStartRef.current = null; lassoRectRef.current = null; setLasso(null); if (isPanningRef.current) e.target.stopDrag(); }}
          onDragMove={handleStageDragMove}
          onDragEnd={handleStageDragEnd}
        >
          {/* Object layer */}
          <Layer>
            {/* Label surface */}
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

            {/* Grid above the label surface, below objects */}
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
                onSelect={(add) => add ? toggleSelectObject(obj.id) : selectObject(obj.id)}
                onChange={(changes) => handleObjectChange(obj.id, changes)}
                snap={snap}
              />
            ))}

            {/* Ghost preview while dragging any object from the palette */}
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

            {/* Lasso selection rectangle */}
            {lasso && (
              <Rect
                x={lasso.x}
                y={lasso.y}
                width={lasso.w}
                height={lasso.h}
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
              rotateEnabled={false}
              resizeEnabled={selectedIds.length <= 1}
              enabledAnchors={
                selectedIds.length > 1
                  ? []
                  : BARCODE_1D_TYPES.has(objects.find((o) => o.id === selectedIds[0])?.type ?? '')
                    ? ['top-center', 'bottom-center']
                    : undefined
              }
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 10 || newBox.height < 10 ? oldBox : newBox
              }
              onTransformEnd={() => {
                if (selectedIds.length !== 1 || !selectedIds[0] || !stageRef.current) return;
                const singleId = selectedIds[0];
                const node = stageRef.current.findOne<Konva.Node>(
                  `#${singleId}`,
                );
                if (!node) return;
                const sx = node.scaleX();
                const sy = node.scaleY();
                node.scaleX(1);
                node.scaleY(1);
                const obj = useLabelStore
                  .getState()
                  .objects.find((o) => o.id === singleId);
                if (!obj) return;
                const pos = {
                  x: snap(pxToDots(node.x() - objectsOffsetX, scale, label.dpmm)),
                  y: snap(pxToDots(node.y() - labelOffsetY, scale, label.dpmm)),
                };
                if (obj.type === "text") {
                  updateObject(singleId, {
                    ...pos,
                    props: { fontHeight: Math.max(1, snap(Math.round(obj.props.fontHeight * sy))) },
                  });
                } else if (BARCODE_1D_TYPES.has(obj.type)) {
                  const p = obj.props as { height: number };
                  updateObject(singleId, {
                    ...pos,
                    props: { height: Math.max(1, snap(Math.round(p.height * sy))) },
                  });
                } else if (obj.type === "pdf417") {
                  updateObject(singleId, {
                    ...pos,
                    props: {
                      rowHeight: Math.max(1, snap(Math.round(obj.props.rowHeight * sy))),
                      moduleWidth: Math.max(1, Math.min(10, Math.round(obj.props.moduleWidth * sx))),
                    },
                  });
                } else if (obj.type === "box") {
                  updateObject(singleId, {
                    ...pos,
                    props: {
                      width: Math.max(1, snap(Math.round(obj.props.width * sx))),
                      height: Math.max(1, snap(Math.round(obj.props.height * sy))),
                    },
                  });
                } else if (obj.type === "qrcode") {
                  updateObject(singleId, {
                    ...pos,
                    props: { magnification: Math.max(1, Math.min(10, Math.round(obj.props.magnification * Math.min(sx, sy)))) },
                  });
                } else if (obj.type === "datamatrix") {
                  updateObject(singleId, {
                    ...pos,
                    props: { dimension: Math.max(1, Math.min(12, Math.round(obj.props.dimension * Math.min(sx, sy)))) },
                  });
                } else if (obj.type === "ellipse") {
                  updateObject(singleId, {
                    ...pos,
                    props: {
                      width:  Math.max(1, snap(Math.round(obj.props.width  * sx))),
                      height: Math.max(1, snap(Math.round(obj.props.height * sy))),
                    },
                  });
                }
                // 'line' is intentionally excluded — it uses its own endpoint handle
              }}
            />
          </Layer>

          {/* Ruler — topmost layer, always covers everything */}
          <Layer listening={false}>
            <Ruler
              labelOffsetX={labelOffsetX}
              labelOffsetY={labelOffsetY}
              labelWidthMm={effectiveWidthMm}
              labelHeightMm={label.heightMm}
              scale={scale}
              canvasWidth={containerSize.width}
              canvasHeight={containerSize.height}
              unit={unit}
              colors={colors}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}
