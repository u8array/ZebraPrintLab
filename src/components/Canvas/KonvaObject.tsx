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
  dpmm: number;
  offsetX: number;
  offsetY: number;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (changes: ObjectChanges) => void;
  snap: (dots: number) => number;
}

type LineLabelObject = Extract<LabelObject, { type: 'line' }>;

// Separate component so hooks (useState) can be used for live endpoint drag
// Called only after obj.type === 'line' guard in KonvaObject, so the cast is safe.
function LineObject({ obj: obj_, scale, dpmm, offsetX, offsetY, isSelected, onSelect, onChange, snap }: Props) {
  const obj = obj_ as LineLabelObject;
  const p = obj.props;
  // All positions are absolute stage coordinates — the Group has no offset.
  // This eliminates any parent-child draggable conflict.
  const x1 = offsetX + dotsToPx(obj.x, scale, dpmm);
  const y1 = offsetY + dotsToPx(obj.y, scale, dpmm);
  const rad = (p.angle * Math.PI) / 180;
  const lenPx = dotsToPx(p.length, scale, dpmm);
  const x2 = x1 + lenPx * Math.cos(rad);
  const y2 = y1 + lenPx * Math.sin(rad);

  const strokeColor = p.color === 'B' ? '#000000' : '#cccccc';
  const lineStrokeWidth = Math.max(dotsToPx(p.thickness, scale, dpmm), 1);

  // Live positions while handles are being dragged (snapped preview)
  const [livePt1, setLivePt1] = useState<{ x: number; y: number } | null>(null);
  const [livePt2, setLivePt2] = useState<{ x: number; y: number } | null>(null);

  // Live drag delta while the whole line is being dragged
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dx = dragDelta.x;
  const dy = dragDelta.y;

  // Visual endpoints: handle-drag overrides whole-line delta
  const dispX1 = livePt1?.x ?? (x1 + dx);
  const dispY1 = livePt1?.y ?? (y1 + dy);
  const dispX2 = livePt2?.x ?? (x2 + dx);
  const dispY2 = livePt2?.y ?? (y2 + dy);

  return (
    <Group id={obj.id}>
      {/* Visible line — tracks both whole-drag and handle-drag live */}
      <KLine
        points={[dispX1, dispY1, dispX2, dispY2]}
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
            x: obj.x + pxToDots(deltaXPx, scale, dpmm),
            y: obj.y + pxToDots(deltaYPx, scale, dpmm),
          });
        }}
      />
      {isSelected && (
        <>
          {/* Start point — dragging moves the origin; end point stays fixed */}
          <Circle
            x={livePt1?.x ?? (x1 + dx)}
            y={livePt1?.y ?? (y1 + dy)}
            radius={6}
            fill="#6366f1"
            stroke="white"
            strokeWidth={1.5}
            draggable
            onDragMove={(e) => {
              const snappedX = offsetX + dotsToPx(snap(pxToDots(e.target.x() - offsetX, scale, dpmm)), scale, dpmm);
              const snappedY = offsetY + dotsToPx(snap(pxToDots(e.target.y() - offsetY, scale, dpmm)), scale, dpmm);
              e.target.position({ x: snappedX, y: snappedY });
              setLivePt1({ x: snappedX, y: snappedY });
            }}
            onDragEnd={(e) => {
              const snapped = livePt1 ?? { x: e.target.x(), y: e.target.y() };
              e.target.position({ x: x1 + dx, y: y1 + dy });
              setLivePt1(null);
              const newStartDotX = pxToDots(snapped.x - offsetX, scale, dpmm);
              const newStartDotY = pxToDots(snapped.y - offsetY, scale, dpmm);
              const endDotX = pxToDots(x2 - offsetX, scale, dpmm);
              const endDotY = pxToDots(y2 - offsetY, scale, dpmm);
              const dxDots = endDotX - newStartDotX;
              const dyDots = endDotY - newStartDotY;
              const newLen = Math.sqrt(dxDots * dxDots + dyDots * dyDots);
              const newAngle = Math.round((Math.atan2(dyDots, dxDots) * 180) / Math.PI);
              onChange({
                x: newStartDotX,
                y: newStartDotY,
                props: { length: Math.max(1, Math.round(newLen)), angle: newAngle },
              });
            }}
          />
          {/* End point — dragging changes length & angle */}
          <Circle
            x={livePt2?.x ?? (x2 + dx)}
            y={livePt2?.y ?? (y2 + dy)}
            radius={6}
            fill="#6366f1"
            stroke="white"
            strokeWidth={1.5}
            draggable
            onDragMove={(e) => {
              const snappedX = offsetX + dotsToPx(snap(pxToDots(e.target.x() - offsetX, scale, dpmm)), scale, dpmm);
              const snappedY = offsetY + dotsToPx(snap(pxToDots(e.target.y() - offsetY, scale, dpmm)), scale, dpmm);
              e.target.position({ x: snappedX, y: snappedY });
              setLivePt2({ x: snappedX, y: snappedY });
            }}
            onDragEnd={(e) => {
              const snapped = livePt2 ?? { x: e.target.x(), y: e.target.y() };
              e.target.position({ x: x2 + dx, y: y2 + dy });
              setLivePt2(null);
              const dxDots = pxToDots(snapped.x - offsetX, scale, dpmm) - obj.x;
              const dyDots = pxToDots(snapped.y - offsetY, scale, dpmm) - obj.y;
              const newLen = Math.sqrt(dxDots * dxDots + dyDots * dyDots);
              const newAngle = Math.round((Math.atan2(dyDots, dxDots) * 180) / Math.PI);
              onChange({ props: { length: Math.max(1, Math.round(newLen)), angle: newAngle } });
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
  dpmm,
  offsetX,
  offsetY,
  isSelected,
  onSelect,
  onChange,
  snap,
}: Props) {
  const x = offsetX + dotsToPx(obj.x, scale, dpmm);
  const y = offsetY + dotsToPx(obj.y, scale, dpmm);

  // Snap a stage-position to the nearest grid point, returns stage-position.
  const snapPos = (stageX: number, stageY: number) => ({
    x: offsetX + dotsToPx(snap(pxToDots(stageX - offsetX, scale, dpmm)), scale, dpmm),
    y: offsetY + dotsToPx(snap(pxToDots(stageY - offsetY, scale, dpmm)), scale, dpmm),
  });

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.target.position(snapPos(e.target.x(), e.target.y()));
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onChange({
      x: pxToDots(e.target.x() - offsetX, scale, dpmm),
      y: pxToDots(e.target.y() - offsetY, scale, dpmm),
    });
  };

  if (obj.type === 'text') {
    const p = obj.props;
    const fontSize = Math.max(dotsToPx(p.fontHeight, scale, dpmm) / 0.72, 6);
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
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    );
  }

  if (obj.type === 'serial') {
    const p = obj.props;
    const fontSize = Math.max(dotsToPx(p.fontHeight, scale, dpmm) / 0.72, 6);
    const zplRotationDeg: Record<typeof p.rotation, number> = {
      N: 0, R: 90, I: 180, B: 270,
    };
    return (
      <Text
        id={obj.id}
        x={x}
        y={y}
        text={`#${p.content}`}
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
        onDragMove={handleDragMove}
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
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <Rect
          width={dotsToPx(300, scale, dpmm)}
          height={dotsToPx(p.height + 20, scale, dpmm)}
          fill="#f9fafb"
          stroke={isSelected ? '#6366f1' : '#9ca3af'}
          strokeWidth={isSelected ? 2 : 1}
          dash={isSelected ? undefined : [4, 2]}
        />
        <Text
          x={6}
          y={6}
          text={label}
          fontSize={Math.max(dotsToPx(14, scale, dpmm), 8)}
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
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <Rect
          width={dotsToPx(270, scale, dpmm)}
          height={dotsToPx(p.height + 20, scale, dpmm)}
          fill="#f9fafb"
          stroke={isSelected ? '#6366f1' : '#9ca3af'}
          strokeWidth={isSelected ? 2 : 1}
          dash={isSelected ? undefined : [4, 2]}
        />
        <Text
          x={6}
          y={6}
          text={`| ${p.content} |`}
          fontSize={Math.max(dotsToPx(14, scale, dpmm), 8)}
          fill="#374151"
        />
      </Group>
    );
  }

  if (obj.type === 'qrcode') {
    const p = obj.props;
    const size = dotsToPx(p.magnification * 25, scale, dpmm);
    return (
      <Group
        id={obj.id}
        x={x}
        y={y}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragMove={handleDragMove}
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
    const size = dotsToPx(p.dimension * 20, scale, dpmm);
    return (
      <Group
        id={obj.id}
        x={x}
        y={y}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragMove={handleDragMove}
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
    const w = dotsToPx(p.width, scale, dpmm);
    const h = dotsToPx(p.height, scale, dpmm);
    const stroke = p.color === 'B' ? '#000000' : '#cccccc';
    const strokeWidth = Math.max(dotsToPx(p.thickness, scale, dpmm), 0.5);
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
        cornerRadius={p.rounding * dotsToPx(Math.min(p.width, p.height) / 8, scale, dpmm)}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    );
  }

  if (obj.type === 'ellipse') {
    const p = obj.props;
    const rx = dotsToPx(p.width, scale, dpmm) / 2;
    const ry = dotsToPx(p.height, scale, dpmm) / 2;
    const stroke = p.color === 'B' ? '#000000' : '#cccccc';
    const strokeWidth = Math.max(dotsToPx(p.thickness, scale, dpmm), 0.5);
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
        onDragMove={(e) => {
          // Center-anchored: snap the top-left corner, then re-add radius
          const snapped = snapPos(e.target.x() - rx, e.target.y() - ry);
          e.target.position({ x: snapped.x + rx, y: snapped.y + ry });
        }}
        onDragEnd={(e) => {
          onChange({
            x: pxToDots(e.target.x() - rx - offsetX, scale, dpmm),
            y: pxToDots(e.target.y() - ry - offsetY, scale, dpmm),
          });
        }}
      />
    );
  }

  return null;
}
