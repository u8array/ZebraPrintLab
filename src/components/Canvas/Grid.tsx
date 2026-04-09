import { Group, Line } from 'react-konva';

interface Props {
  labelOffsetX: number;
  labelOffsetY: number;
  labelWidthPx: number;
  labelHeightPx: number;
  scale: number;      // px/mm
  snapSizeMm: number; // primary grid = snap interval
}

export function Grid({
  labelOffsetX,
  labelOffsetY,
  labelWidthPx,
  labelHeightPx,
  scale,
  snapSizeMm,
}: Props) {
  const snapPx = scale * snapSizeMm;
  const sub1Px = scale * 1;
  // Show 1mm subdivision lines when zoomed in and snap is coarser than 1mm
  const showSub = snapSizeMm > 1 && scale >= 4;

  const lines: React.ReactElement[] = [];
  const right = labelOffsetX + labelWidthPx;
  const bottom = labelOffsetY + labelHeightPx;

  // Snap grid (primary — always visible, matches snap interval)
  for (let x = labelOffsetX + snapPx; x < right; x += snapPx) {
    lines.push(
      <Line key={`vs-${x}`} points={[x, labelOffsetY, x, bottom]}
        stroke="#d1d5db" strokeWidth={0.5} listening={false} />
    );
  }
  for (let y = labelOffsetY + snapPx; y < bottom; y += snapPx) {
    lines.push(
      <Line key={`hs-${y}`} points={[labelOffsetX, y, right, y]}
        stroke="#d1d5db" strokeWidth={0.5} listening={false} />
    );
  }

  // 1mm subdivision lines (skip positions already covered by snap lines)
  if (showSub) {
    const stepsPerSnap = Math.round(snapSizeMm);
    for (let x = labelOffsetX + sub1Px; x < right; x += sub1Px) {
      const step = Math.round((x - labelOffsetX) / sub1Px);
      if (step % stepsPerSnap === 0) continue;
      lines.push(
        <Line key={`v1-${x}`} points={[x, labelOffsetY, x, bottom]}
          stroke="#e9ecef" strokeWidth={0.3} listening={false} />
      );
    }
    for (let y = labelOffsetY + sub1Px; y < bottom; y += sub1Px) {
      const step = Math.round((y - labelOffsetY) / sub1Px);
      if (step % stepsPerSnap === 0) continue;
      lines.push(
        <Line key={`h1-${y}`} points={[labelOffsetX, y, right, y]}
          stroke="#e9ecef" strokeWidth={0.3} listening={false} />
      );
    }
  }

  return <Group listening={false}>{lines}</Group>;
}
