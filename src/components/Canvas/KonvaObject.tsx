import { useState } from 'react';
import { Circle, Ellipse, Group, Line as KLine, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { LabelObject } from '../../types/ObjectType';
import { dotsToPx, pxToDots } from '../../lib/coordinates';
import type { TextProps } from '../../registry/text';
import type { Code128Props } from '../../registry/code128';
import type { Code39Props } from '../../registry/code39';
import type { Ean13Props } from '../../registry/ean13';
import type { QrCodeProps } from '../../registry/qrcode';
import type { DataMatrixProps } from '../../registry/datamatrix';
import type { BoxProps } from '../../registry/box';
import type { EllipseProps } from '../../registry/ellipse';
import type { LineProps } from '../../registry/line';

interface Props {
  obj: LabelObject;
  scale: number;
  offsetX: number;
  offsetY: number;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (changes: Partial<LabelObject>) => void;
}

const props = <T,>(obj: LabelObject) => obj.props as T;

// Separate component so hooks (useState) can be used for live endpoint drag
function LineObject({ obj, scale, offsetX, offsetY, isSelected, onSelect, onChange }: Props) {
  const p = obj.props as LineProps;
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
    const p = props<TextProps>(obj);
    const fontSize = Math.max(dotsToPx(p.fontHeight, scale) / 0.72, 6);
    const zplRotationDeg: Record<TextProps['rotation'], number> = {
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
    const p = props<Code128Props | Code39Props>(obj);
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
    const p = props<Ean13Props>(obj);
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
    const p = props<QrCodeProps>(obj);
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
    const p = props<DataMatrixProps>(obj);
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
    const p = props<BoxProps>(obj);
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
    const p = props<EllipseProps>(obj);
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
