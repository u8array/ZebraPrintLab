import { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import { useLabelStore } from '../../store/labelStore';
import { dotsToPx, pxToDots, DPMM } from '../../lib/coordinates';
import { KonvaObject } from './KonvaObject';
import { Grid } from './Grid';
import { Ruler, RULER_SIZE } from './Ruler';
import type { TextProps } from '../../registry/text';
import type { Code128Props } from '../../registry/code128';

const PADDING = 40;
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

interface Props {
  showGrid: boolean;
  snapEnabled: boolean;
}

export function LabelCanvas({ showGrid, snapEnabled }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);

  const zoomIn  = () => setZoom(z => ZOOM_STEPS.find(s => s > z) ?? ZOOM_STEPS.at(-1)!);
  const zoomOut = () => setZoom(z => [...ZOOM_STEPS].reverse().find(s => s < z) ?? ZOOM_STEPS[0]);
  const zoomFit = () => setZoom(1);

  const { label, objects, selectedId, addObject, updateObject, selectObject } =
    useLabelStore();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // non-passive wheel listener so preventDefault works for ctrl+scroll zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(z => {
        const next = z * (e.deltaY < 0 ? 1.1 : 0.9);
        return Math.max(ZOOM_STEPS[0], Math.min(ZOOM_STEPS.at(-1)!, next));
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // usable area after reserving space for the ruler
  const usableWidth = containerSize.width - RULER_SIZE;
  const usableHeight = containerSize.height - RULER_SIZE;

  const scaleX = usableWidth > 0 ? (usableWidth - PADDING * 2) / label.widthMm : 1;
  const scaleY = usableHeight > 0 ? (usableHeight - PADDING * 2) / label.heightMm : 1;
  const scale = Math.min(scaleX, scaleY) * zoom;

  const labelWidthPx = label.widthMm * scale;
  const labelHeightPx = label.heightMm * scale;
  const labelOffsetX = RULER_SIZE + (usableWidth - labelWidthPx) / 2;
  const labelOffsetY = RULER_SIZE + (usableHeight - labelHeightPx) / 2;

  // snap dots to nearest mm boundary
  const snap = useCallback((dots: number) =>
    snapEnabled ? Math.round(dots / DPMM) * DPMM : dots,
    [snapEnabled]
  );

  const handleObjectChange = useCallback((id: string, changes: Parameters<typeof updateObject>[1]) => {
    updateObject(id, {
      ...changes,
      ...(changes.x !== undefined && { x: snap(changes.x) }),
      ...(changes.y !== undefined && { y: snap(changes.y) }),
    });
  }, [snap, updateObject]);

  // Transformer aktualisieren
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    const node = selectedId
      ? stageRef.current.findOne<Konva.Node>(`#${selectedId}`)
      : null;
    transformerRef.current.nodes(node ? [node] : []);
  }, [selectedId, objects]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('objectType');
      if (!type || !stageRef.current) return;
      stageRef.current.setPointersPositions(e.nativeEvent);
      const pos = stageRef.current.getPointerPosition();
      if (!pos) return;
      addObject(type, {
        x: snap(pxToDots(pos.x - labelOffsetX, scale)),
        y: snap(pxToDots(pos.y - labelOffsetY, scale)),
      });
    },
    [addObject, labelOffsetX, labelOffsetY, scale, snap]
  );

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target === e.target.getStage()) selectObject(null);
    },
    [selectObject]
  );

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{
        background: '#0c0c0f',
        backgroundImage: 'radial-gradient(circle, #2a2a38 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Zoom-Controls */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 bg-surface border border-border rounded px-1 py-0.5">
        <button onClick={zoomOut} className="w-6 h-6 flex items-center justify-center text-muted hover:text-text font-mono text-sm transition-colors">−</button>
        <button onClick={zoomFit} className="font-mono text-[10px] text-muted hover:text-accent w-10 text-center transition-colors">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={zoomIn} className="w-6 h-6 flex items-center justify-center text-muted hover:text-text font-mono text-sm transition-colors">+</button>
      </div>
      {containerSize.width > 0 && (
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          onClick={handleStageClick}
        >
          {/* Objekt-Layer */}
          <Layer>
            {/* Label-Fläche */}
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

            {/* Raster über dem weißen Rect, unter den Objekten */}
            {showGrid && (
              <Grid
                labelOffsetX={labelOffsetX}
                labelOffsetY={labelOffsetY}
                labelWidthPx={labelWidthPx}
                labelHeightPx={labelHeightPx}
                scale={scale}
              />
            )}

            {objects.map((obj) => (
              <KonvaObject
                key={obj.id}
                obj={obj}
                scale={scale}
                offsetX={labelOffsetX}
                offsetY={labelOffsetY}
                isSelected={obj.id === selectedId}
                onSelect={() => selectObject(obj.id)}
                onChange={(changes) => handleObjectChange(obj.id, changes)}
              />
            ))}

            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 10 || newBox.height < 10 ? oldBox : newBox
              }
              onTransformEnd={() => {
                if (!selectedId || !stageRef.current) return;
                const node = stageRef.current.findOne<Konva.Node>(`#${selectedId}`);
                if (!node) return;
                const scaleY = node.scaleY();
                node.scaleX(1);
                node.scaleY(1);
                const obj = useLabelStore.getState().objects.find((o) => o.id === selectedId);
                if (!obj) return;
                const pos = {
                  x: snap(pxToDots(node.x() - labelOffsetX, scale)),
                  y: snap(pxToDots(node.y() - labelOffsetY, scale)),
                };
                if (obj.type === 'text') {
                  const p = obj.props as TextProps;
                  updateObject(selectedId, {
                    ...pos,
                    props: { fontHeight: Math.max(1, Math.round(p.fontHeight * scaleY)) },
                  });
                } else if (obj.type === 'code128') {
                  const p = obj.props as Code128Props;
                  updateObject(selectedId, {
                    ...pos,
                    props: { height: Math.max(1, Math.round(p.height * scaleY)) },
                  });
                }
              }}
            />
          </Layer>

          {/* Lineal — ganz oben, überdeckt alles */}
          <Layer listening={false}>
            <Ruler
              labelOffsetX={labelOffsetX}
              labelOffsetY={labelOffsetY}
              labelWidthMm={label.widthMm}
              labelHeightMm={label.heightMm}
              scale={scale}
              canvasWidth={containerSize.width}
              canvasHeight={containerSize.height}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}
