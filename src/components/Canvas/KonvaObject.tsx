import { useState } from 'react';
import { Circle, Ellipse, Group, Line as KLine, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { LabelObject } from '../../registry';
import type { LabelObjectBase } from '../../types/ObjectType';
import { dotsToPx, pxToDots } from '../../lib/coordinates';

type ObjectChanges = Partial<Omit<LabelObjectBase, 'id' | 'type'>> & { props?: object };

interface Props {
  obj: LabelObject;
  scale: number;
  offsetX: number;
  offsetY: number;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (changes: ObjectChanges) => void;
}

type LineLabelObject = Extract<LabelObject, { type: 'line' }>;

// Separate component so hooks (useState) can be used for live endpoint drag
// Called only after obj.type === 'line' guard in KonvaObject, so the cast is safe.
function LineObject({ obj: obj_, scale, offsetX, offsetY, isSelected, onSelect, onChange }: Props) {
  const obj = obj_ as LineLabelObject;
  const p = obj.props;
  // All positions are absolute stage coordinates — the Group has no offset.
  // This eliminates any parent-child draggable conflict.
  const x1 = offsetX + dotsToPx(obj.x, scale);
  const y1 = offsetY + dotsToPx(obj.y, scale);
  const rad = (p.angle * Math.PI) / 180;
  const lenPx = dotsToPx(p.length, scale);
  const x2 = x1 + lenPx * Math.cos(rad);
  const y2 = y1 + lenPx * Math.sin(rad);

  const strokeColor = p.color === 'B' ? '#000000' : '#cccccc';
  const lineStrokeWidth = Math.max(dotsToPx(p.thickness, scale), 1);

  // Live end position while the endpoint circle is being dragged
  const [livePt2, setLivePt2] = useState<{ x: number; y: number } | null>(null);
  const displayX2 = livePt2?.x ?? x2;
  const displayY2 = livePt2?.y ?? y2;

  // Live drag delta while the whole line is being dragged
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dx = dragDelta.x;
  const dy = dragDelta.y;

  return (
    <Group id={obj.id}>
      {/* Visible line — tracks both whole-drag and endpoint-drag live */}
      <KLine
        points={[x1 + dx, y1 + dy, displayX2 + dx, displayY2 + dy]}
        stroke={isSelected ? '#6366f1' : strokeColor}
        strokeWidth={lineStrokeWidth}
        lineCap="round"
        listening={false}
      />
      {/* Wide transparent hit area — handles click-to-select and whole-line drag. */}
      <KLine
        points={[x1, y1, x2, y2]}
        stroke="transparent"
        strokeWidth={Math.max(lineStrokeWidth, 14)}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragMove={(e) => {
          setDragDelta({ x: e.target.x(), y: e.target.y() });
        }}
        onDragEnd={(e) => {
          const deltaXPx = e.target.x();
          const deltaYPx = e.target.y();
          e.target.position({ x: 0, y: 0 });
          setDragDelta({ x: 0, y: 0 });
          onChange({
            x: obj.x + pxToDots(deltaXPx, scale),
            y: obj.y + pxToDots(deltaYPx, scale),
          });
        }}
      />
      {isSelected && (
        <>
          {/* Start point indicator — follows whole-drag delta */}
          <Circle
            x={x1 + dx}
            y={y1 + dy}
            radius={6}
            fill="#6366f1"
            stroke="white"
            strokeWidth={1.5}
            listening={false}
          />
          {/* End point — dragging changes length & angle */}
          <Circle
            x={x2 + dx}
            y={y2 + dy}
            radius={6}
            fill="#6366f1"
            stroke="white"
            strokeWidth={1.5}
            draggable
            onDragMove={(e) => {
              setLivePt2({ x: e.target.x(), y: e.target.y() });
            }}
            onDragEnd={(e) => {
              const newX2 = e.target.x();
              const newY2 = e.target.y();
              e.target.position({ x: x2 + dx, y: y2 + dy });
              setLivePt2(null);
              const dxPx = newX2 - x1;
              const dyPx = newY2 - y1;
              const newLen = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
              const newAngle = Math.round((Math.atan2(dyPx, dxPx) * 180) / Math.PI);
              // type assertion is safe: this component only renders for 'line' objects
              onChange({ props: { length: Math.max(1, Math.round(pxToDots(newLen, scale))), angle: newAngle } });
            }}
          />
        </>
      )}
    </Group>
  );
}

export function KonvaObject(props_: Props) {
  if (props_.obj.type === 'line') return <LineObject {...props_} />;
  return <KonvaObjectInner {...props_} />;
}

function KonvaObjectInner({
  obj,
  scale,
  offsetX,
  offsetY,
  isSelected,
  onSelect,
  onChange,
}: Props) {
  const x = offsetX + dotsToPx(obj.x, scale);
  const y = offsetY + dotsToPx(obj.y, scale);

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onChange({
      x: pxToDots(e.target.x() - offsetX, scale),
      y: pxToDots(e.target.y() - offsetY, scale),
    });
  };

  if (obj.type === 'text') {
    const p = obj.props;
    const fontSize = Math.max(dotsToPx(p.fontHeight, scale) / 0.72, 6);
    const zplRotationDeg: Record<typeof p.rotation, number> = {
      N: 0, R: 90, I: 180, B: 270,
    };
    return (
      <Text
        id={obj.id}
        x={x}
        y={y}
        text={p.content}
        fontSize={fontSize}
        fontFamily="'Barlow', sans-serif"
        fontStyle="bold"
        rotation={zplRotationDeg[p.rotation]}
        fill="#000000"
        stroke={isSelected ? '#6366f1' : undefined}
        strokeWidth={isSelected ? 1 : 0}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
      />
    );
  }

  if (obj.type === 'code128' || obj.type === 'code39') {
    const p = obj.props;
    const label = obj.type === 'code128' ? `||| ${p.content} |||` : `| ${p.content} |`;
    return (
      <Group
        id={obj.id}
        x={x}
        y={y}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
      >
        <Rect
          width={dotsToPx(300, scale)}
          height={dotsToPx(p.height + 20, scale)}
          fill="#f9fafb"
          stroke={isSelected ? '#6366f1' : '#9ca3af'}
          strokeWidth={isSelected ? 2 : 1}
          dash={isSelected ? undefined : [4, 2]}
        />
        <Text
          x={6}
          y={6}
          text={label}
          fontSize={Math.max(dotsToPx(14, scale), 8)}
          fill="#374151"
        />
      </Group>
    );
  }

  if (obj.type === 'ean13') {
    const p = obj.props;
    return (
      <Group
        id={obj.id}
        x={x}
        y={y}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
      >
        <Rect
          width={dotsToPx(270, scale)}
          height={dotsToPx(p.height + 20, scale)}
          fill="#f9fafb"
          stroke={isSelected ? '#6366f1' : '#9ca3af'}
          strokeWidth={isSelected ? 2 : 1}
          dash={isSelected ? undefined : [4, 2]}
        />
        <Text
          x={6}
          y={6}
          text={`| ${p.content} |`}
          fontSize={Math.max(dotsToPx(14, scale), 8)}
          fill="#374151"
        />
      </Group>
    );
  }

  if (obj.type === 'qrcode') {
    const p = obj.props;
    const size = dotsToPx(p.magnification * 25, scale);
    return (
      <Group
        id={obj.id}
        x={x}
        y={y}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
      >
        <Rect
          width={size}
          height={size}
          fill="#f9fafb"
          stroke={isSelected ? '#6366f1' : '#9ca3af'}
          strokeWidth={isSelected ? 2 : 1}
          dash={isSelected ? undefined : [4, 2]}
        />
        <Text
          x={6}
          y={6}
          text="QR"
          fontSize={Math.max(size * 0.3, 8)}
          fill="#374151"
          fontStyle="bold"
        />
      </Group>
    );
  }

  if (obj.type === 'datamatrix') {
    const p = obj.props;
    const size = dotsToPx(p.dimension * 20, scale);
    return (
      <Group
        id={obj.id}
        x={x}
        y={y}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
      >
        <Rect
          width={size}
          height={size}
          fill="#f9fafb"
          stroke={isSelected ? '#6366f1' : '#9ca3af'}
          strokeWidth={isSelected ? 2 : 1}
          dash={isSelected ? undefined : [4, 2]}
        />
        <Text
          x={6}
          y={6}
          text="DM"
          fontSize={Math.max(size * 0.3, 8)}
          fill="#374151"
          fontStyle="bold"
        />
      </Group>
    );
  }

  if (obj.type === 'box') {
    const p = obj.props;
    const w = dotsToPx(p.width, scale);
    const h = dotsToPx(p.height, scale);
    const stroke = p.color === 'B' ? '#000000' : '#cccccc';
    const strokeWidth = Math.max(dotsToPx(p.thickness, scale), 0.5);
    const fill = p.filled ? (p.color === 'B' ? '#000000' : '#ffffff') : 'transparent';
    return (
      <Rect
        id={obj.id}
        x={x}
        y={y}
        width={w}
        height={h}
        stroke={isSelected ? '#6366f1' : stroke}
        strokeWidth={isSelected ? Math.max(strokeWidth, 1.5) : strokeWidth}
        fill={fill}
        cornerRadius={p.rounding * dotsToPx(Math.min(p.width, p.height) / 8, scale)}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
      />
    );
  }

  if (obj.type === 'ellipse') {
    const p = obj.props;
    const rx = dotsToPx(p.width, scale) / 2;
    const ry = dotsToPx(p.height, scale) / 2;
    const stroke = p.color === 'B' ? '#000000' : '#cccccc';
    const strokeWidth = Math.max(dotsToPx(p.thickness, scale), 0.5);
    const fill = p.filled ? (p.color === 'B' ? '#000000' : '#ffffff') : 'transparent';
    return (
      <Ellipse
        id={obj.id}
        x={x + rx}
        y={y + ry}
        radiusX={rx}
        radiusY={ry}
        stroke={isSelected ? '#6366f1' : stroke}
        strokeWidth={isSelected ? Math.max(strokeWidth, 1.5) : strokeWidth}
        fill={fill}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onChange({
            x: pxToDots(e.target.x() - rx - offsetX, scale),
            y: pxToDots(e.target.y() - ry - offsetY, scale),
          });
        }}
      />
    );
  }

  return null;
}
