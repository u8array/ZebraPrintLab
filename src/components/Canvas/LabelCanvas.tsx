import { useRef, useEffect, useLayoutEffect, useState } from "react";
import { Stage, Layer, Group, Rect, Transformer } from "react-konva";
import type Konva from "konva";
import { useLabelStore } from "../../store/labelStore";
import { pxToDots } from "../../lib/coordinates";
import { KonvaObject } from "./KonvaObject";
import { Grid } from "./Grid";
import { Ruler, RULER_SIZE } from "./Ruler";
import { ObjectRegistry, BARCODE_1D_TYPES } from "../../registry";
import type { LabelObject } from "../../registry";
import { useColorScheme } from "../../lib/useColorScheme";

const PADDING = 40;
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

interface Props {
  showGrid: boolean;
  onGridToggle: () => void;
  snapEnabled: boolean;
  onSnapToggle: () => void;
  snapSizeMm: number;
  onSnapSizeChange: (mm: number) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export function LabelCanvas({ showGrid, onGridToggle, snapEnabled, onSnapToggle, snapSizeMm, onSnapSizeChange, zoom, onZoomChange }: Props) {
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

  // Ghost object shown while dragging any object from the palette
  const [ghost, setGhost] = useState<LabelObject | null>(null);
  const dragEnterCountRef = useRef(0);

  const zoomIn  = () => onZoomChange(ZOOM_STEPS.find(s => s > zoom) ?? ZOOM_MAX);
  const zoomOut = () => onZoomChange([...ZOOM_STEPS].reverse().find(s => s < zoom) ?? ZOOM_MIN);
  const zoomFit = () => {
    onZoomChange(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const colors = useColorScheme();

  const { label, objects, selectedId, addObject, updateObject, removeObject, selectObject } =
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

  // Delete/Backspace removes the selected object; ignored when focus is inside an input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Delete' && e.code !== 'Backspace') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const id = useLabelStore.getState().selectedId;
      if (!id) return;
      e.preventDefault();
      removeObject(id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [removeObject]);

  // arrow keys move the selected object; ignored when focus is inside an input
  useEffect(() => {
    const ARROW = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    const onKeyDown = (e: KeyboardEvent) => {
      if (!ARROW.has(e.code)) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const id = useLabelStore.getState().selectedId;
      if (!id) return;
      e.preventDefault();

      // shift = 10 mm, normal = snapSize when snap on, 1 dot when snap off
      const step = e.shiftKey ? label.dpmm * 10 : snapEnabled ? Math.round(snapSizeMm * label.dpmm) : 1;
      const dx =
        e.code === "ArrowRight" ? step : e.code === "ArrowLeft" ? -step : 0;
      const dy =
        e.code === "ArrowDown" ? step : e.code === "ArrowUp" ? -step : 0;

      const obj = useLabelStore.getState().objects.find((o) => o.id === id);
      if (!obj) return;
      updateObject(id, { x: obj.x + dx, y: obj.y + dy });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [snapEnabled, snapSizeMm, label.dpmm, updateObject]);

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
    if (!isPanningRef.current) return;
    const dx = e.clientX - panStartRef.current.mouseX;
    const dy = e.clientY - panStartRef.current.mouseY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didPanRef.current = true;
    setPanOffset({
      x: panStartRef.current.panX + dx,
      y: panStartRef.current.panY + dy,
    });
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;
    setIsPanning(false);
  };

  // usable area after reserving space for the ruler
  const usableWidth = containerSize.width - RULER_SIZE;
  const usableHeight = containerSize.height - RULER_SIZE;

  const scaleX =
    usableWidth > 0 ? (usableWidth - PADDING * 2) / label.widthMm : 1;
  const scaleY =
    usableHeight > 0 ? (usableHeight - PADDING * 2) / label.heightMm : 1;
  const scale = Math.min(scaleX, scaleY) * zoom;

  const labelWidthPx = label.widthMm * scale;
  const labelHeightPx = label.heightMm * scale;
  const labelOffsetX =
    RULER_SIZE + (usableWidth - labelWidthPx) / 2 + panOffset.x;
  const labelOffsetY =
    RULER_SIZE + (usableHeight - labelHeightPx) / 2 + panOffset.y;

  const snapUnit = Math.round(snapSizeMm * label.dpmm);
  const snap = (dots: number) =>
    snapEnabled ? Math.round(dots / snapUnit) * snapUnit : dots;

  const handleObjectChange = (
    id: string,
    changes: Parameters<typeof updateObject>[1],
  ) => {
    updateObject(id, {
      ...changes,
      ...(changes.x !== undefined && { x: snap(changes.x) }),
      ...(changes.y !== undefined && { y: snap(changes.y) }),
    });
  };

  // Sync transformer selection whenever the selected object or object list changes
  // Lines use their own endpoint handle — skip the transformer for them
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    const selectedObj = objects.find((o) => o.id === selectedId);
    const useTransformer = selectedObj && selectedObj.type !== 'line';
    const node = useTransformer
      ? stageRef.current.findOne<Konva.Node>(`#${selectedId}`)
      : null;
    transformerRef.current.nodes(node ? [node] : []);
  }, [selectedId, objects]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragEnterCountRef.current = 0;
    setGhost(null);
    const type = e.dataTransfer.getData("objectType");
    if (!type || !stageRef.current) return;
    stageRef.current.setPointersPositions(e.nativeEvent);
    const pos = stageRef.current.getPointerPosition();
    if (!pos) return;
    addObject(type, {
      x: snap(pxToDots(pos.x - labelOffsetX, scale, label.dpmm)),
      y: snap(pxToDots(pos.y - labelOffsetY, scale, label.dpmm)),
    });
  };

  const dragTypeFromEvent = (e: React.DragEvent): string | null => {
    const hit = Array.from(e.dataTransfer.types).find((t) => t.startsWith('application/x-zpl-type+'));
    return hit ? hit.slice('application/x-zpl-type+'.length) : null;
  };

  const handleDragEnter = () => {
    dragEnterCountRef.current++;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const type = dragTypeFromEvent(e);
    if (!type || !stageRef.current) return;
    const def = ObjectRegistry[type];
    if (!def) return;
    stageRef.current.setPointersPositions(e.nativeEvent);
    const pos = stageRef.current.getPointerPosition();
    if (!pos) return;
    setGhost({
      id: '__ghost__',
      type,
      x: snap(pxToDots(pos.x - labelOffsetX, scale, label.dpmm)),
      y: snap(pxToDots(pos.y - labelOffsetY, scale, label.dpmm)),
      rotation: 0,
      props: def.defaultProps,
    } as LabelObject);
  };

  const handleDragLeave = () => {
    dragEnterCountRef.current--;
    if (dragEnterCountRef.current <= 0) {
      dragEnterCountRef.current = 0;
      setGhost(null);
    }
  };

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // suppress deselection when the click was the end of a pan gesture
    if (didPanRef.current) {
      didPanRef.current = false;
      return;
    }
    if (e.target === e.target.getStage()) selectObject(null);
  };

  const cursor = isPanning ? "grabbing" : spaceDown ? "grab" : undefined;

  return (
    <div
      ref={containerRef}
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
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
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
          <option value={0.5}>0.5mm</option>
          <option value={1}>1mm</option>
          <option value={2}>2mm</option>
          <option value={5}>5mm</option>
          <option value={10}>10mm</option>
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
              onClick={() => selectObject(null)}
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
                offsetX={labelOffsetX}
                offsetY={labelOffsetY}
                isSelected={obj.id === selectedId}
                onSelect={() => selectObject(obj.id)}
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
                  offsetX={labelOffsetX}
                  offsetY={labelOffsetY}
                  isSelected={false}
                  onSelect={() => { /* ghost */ }}
                  onChange={() => { /* ghost */ }}
                  snap={snap}
                  dpmm={label.dpmm}
                />
              </Group>
            )}

            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              enabledAnchors={
                BARCODE_1D_TYPES.has(objects.find((o) => o.id === selectedId)?.type ?? '')
                  ? ['top-center', 'bottom-center']
                  : undefined
              }
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 10 || newBox.height < 10 ? oldBox : newBox
              }
              onTransformEnd={() => {
                if (!selectedId || !stageRef.current) return;
                const node = stageRef.current.findOne<Konva.Node>(
                  `#${selectedId}`,
                );
                if (!node) return;
                const sx = node.scaleX();
                const sy = node.scaleY();
                node.scaleX(1);
                node.scaleY(1);
                const obj = useLabelStore
                  .getState()
                  .objects.find((o) => o.id === selectedId);
                if (!obj) return;
                const pos = {
                  x: snap(pxToDots(node.x() - labelOffsetX, scale, label.dpmm)),
                  y: snap(pxToDots(node.y() - labelOffsetY, scale, label.dpmm)),
                };
                if (obj.type === "text") {
                  updateObject(selectedId, {
                    ...pos,
                    props: { fontHeight: Math.max(1, snap(Math.round(obj.props.fontHeight * sy))) },
                  });
                } else if (BARCODE_1D_TYPES.has(obj.type)) {
                  updateObject(selectedId, {
                    ...pos,
                    props: { height: Math.max(1, snap(Math.round(obj.props.height * sy))) },
                  });
                } else if (obj.type === "pdf417") {
                  updateObject(selectedId, {
                    ...pos,
                    props: {
                      rowHeight: Math.max(1, snap(Math.round(obj.props.rowHeight * sy))),
                      moduleWidth: Math.max(1, Math.min(10, Math.round(obj.props.moduleWidth * sx))),
                    },
                  });
                } else if (obj.type === "box") {
                  updateObject(selectedId, {
                    ...pos,
                    props: {
                      width: Math.max(1, snap(Math.round(obj.props.width * sx))),
                      height: Math.max(1, snap(Math.round(obj.props.height * sy))),
                    },
                  });
                } else if (obj.type === "qrcode") {
                  updateObject(selectedId, {
                    ...pos,
                    props: { magnification: Math.max(1, Math.min(10, Math.round(obj.props.magnification * Math.min(sx, sy)))) },
                  });
                } else if (obj.type === "datamatrix") {
                  updateObject(selectedId, {
                    ...pos,
                    props: { dimension: Math.max(1, Math.min(12, Math.round(obj.props.dimension * Math.min(sx, sy)))) },
                  });
                } else if (obj.type === "ellipse") {
                  updateObject(selectedId, {
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
              labelWidthMm={label.widthMm}
              labelHeightMm={label.heightMm}
              scale={scale}
              canvasWidth={containerSize.width}
              canvasHeight={containerSize.height}
              colors={colors}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}
