import { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import { useLabelStore } from '../../store/labelStore';
import { dotsToPx, pxToDots } from '../../lib/coordinates';
import { KonvaObject } from './KonvaObject';

const PADDING = 40;

export function LabelCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const { label, objects, selectedId, addObject, updateObject, selectObject } =
    useLabelStore();

  // Container-Größe via ResizeObserver tracken
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

  // Scale so dass Label mit Padding in den Container passt
  const scaleX =
    containerSize.width > 0
      ? (containerSize.width - PADDING * 2) / label.widthMm
      : 1;
  const scaleY =
    containerSize.height > 0
      ? (containerSize.height - PADDING * 2) / label.heightMm
      : 1;
  const scale = Math.min(scaleX, scaleY);

  const labelWidthPx = label.widthMm * scale;
  const labelHeightPx = label.heightMm * scale;
  const labelOffsetX = (containerSize.width - labelWidthPx) / 2;
  const labelOffsetY = (containerSize.height - labelHeightPx) / 2;

  // Transformer an selektiertes Objekt hängen
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    const node = selectedId
      ? stageRef.current.findOne<Konva.Node>(`#${selectedId}`)
      : null;
    transformerRef.current.nodes(node ? [node] : []);
  }, [selectedId, objects]);

  // Drop: neues Objekt an Drop-Position einfügen
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('objectType');
      if (!type || !stageRef.current) return;

      stageRef.current.setPointersPositions(e.nativeEvent);
      const pos = stageRef.current.getPointerPosition();
      if (!pos) return;

      addObject(type, {
        x: pxToDots(pos.x - labelOffsetX, scale),
        y: pxToDots(pos.y - labelOffsetY, scale),
      });
    },
    [addObject, labelOffsetX, labelOffsetY, scale]
  );

  // Klick auf Stage-Hintergrund → deselektieren
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target === e.target.getStage()) selectObject(null);
    },
    [selectObject]
  );

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        background: '#0c0c0f',
        backgroundImage: 'radial-gradient(circle, #2a2a38 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {containerSize.width > 0 && (
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          onClick={handleStageClick}
        >
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

            {/* Objekte */}
            {objects.map((obj) => (
              <KonvaObject
                key={obj.id}
                obj={obj}
                scale={scale}
                offsetX={labelOffsetX}
                offsetY={labelOffsetY}
                isSelected={obj.id === selectedId}
                onSelect={() => selectObject(obj.id)}
                onChange={(changes) => updateObject(obj.id, changes)}
              />
            ))}

            {/* Transformer für selektiertes Objekt */}
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 10 || newBox.height < 10 ? oldBox : newBox
              }
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}
