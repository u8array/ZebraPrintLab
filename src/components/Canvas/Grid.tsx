import { Group, Line } from 'react-konva';

interface Props {
  labelOffsetX: number;
  labelOffsetY: number;
  labelWidthPx: number;
  labelHeightPx: number;
  scale: number; // px/mm
}

export function Grid({
  labelOffsetX,
  labelOffsetY,
  labelWidthPx,
  labelHeightPx,
  scale,
}: Props) {
  const step5px = scale * 5;
  const step1px = scale * 1;
  const show1mm = scale >= 6; // 1mm lines only when zoomed in enough

  const lines: React.ReactElement[] = [];

  const right = labelOffsetX + labelWidthPx;
  const bottom = labelOffsetY + labelHeightPx;

  // 5mm grid
  for (let x = labelOffsetX + step5px; x < right; x += step5px) {
    lines.push(
      <Line key={`v5-${x}`} points={[x, labelOffsetY, x, bottom]}
        stroke="#d1d5db" strokeWidth={0.5} listening={false} />
    );
  }
  for (let y = labelOffsetY + step5px; y < bottom; y += step5px) {
    lines.push(
      <Line key={`h5-${y}`} points={[labelOffsetX, y, right, y]}
        stroke="#d1d5db" strokeWidth={0.5} listening={false} />
    );
  }

  // 1mm grid (only when zoomed in; skip positions already covered by 5mm lines)
  if (show1mm) {
    for (let x = labelOffsetX + step1px; x < right; x += step1px) {
      const isFive = Math.round((x - labelOffsetX) / step1px) % 5 === 0;
      if (isFive) continue;
      lines.push(
        <Line key={`v1-${x}`} points={[x, labelOffsetY, x, bottom]}
          stroke="#e9ecef" strokeWidth={0.3} listening={false} />
      );
    }
    for (let y = labelOffsetY + step1px; y < bottom; y += step1px) {
      const isFive = Math.round((y - labelOffsetY) / step1px) % 5 === 0;
      if (isFive) continue;
      lines.push(
        <Line key={`h1-${y}`} points={[labelOffsetX, y, right, y]}
          stroke="#e9ecef" strokeWidth={0.3} listening={false} />
      );
    }
  }

  return <Group listening={false}>{lines}</Group>;
}
