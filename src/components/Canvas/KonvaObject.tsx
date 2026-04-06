import { Group, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { LabelObject } from '../../types/ObjectType';
import { dotsToPx, pxToDots } from '../../lib/coordinates';
import type { TextProps } from '../../registry/text';
import type { Code128Props } from '../../registry/code128';
import type { BoxProps } from '../../registry/box';

interface Props {
  obj: LabelObject;
  scale: number;
  offsetX: number;
  offsetY: number;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (changes: Partial<LabelObject>) => void;
}

export function KonvaObject({
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
    const p = obj.props as TextProps;
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

  if (obj.type === 'code128') {
    const p = obj.props as Code128Props;
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
          text={`|||  ${p.content}  |||`}
          fontSize={Math.max(dotsToPx(14, scale), 8)}
          fill="#374151"
        />
      </Group>
    );
  }

  if (obj.type === 'box') {
    const p = obj.props as BoxProps;
    const w = dotsToPx(p.width, scale);
    const h = dotsToPx(p.height, scale);
    const stroke = p.color === 'B' ? '#000000' : '#ffffff';
    const strokeWidth = Math.max(dotsToPx(p.thickness, scale), 0.5);
    return (
      <Rect
        id={obj.id}
        x={x}
        y={y}
        width={w}
        height={h}
        stroke={isSelected ? '#6366f1' : stroke}
        strokeWidth={isSelected ? Math.max(strokeWidth, 1.5) : strokeWidth}
        fill="transparent"
        cornerRadius={p.rounding * dotsToPx(Math.min(p.width, p.height) / 8, scale)}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
      />
    );
  }

  return null;
}
