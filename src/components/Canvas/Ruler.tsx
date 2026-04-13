import { Group, Rect, Line, Text } from 'react-konva';
import type { CanvasColors } from '../../lib/useColorScheme';
import { DARK_COLORS } from '../../lib/useColorScheme';
import { rulerTicksMm, rulerLabel } from '../../lib/units';
import type { Unit } from '../../lib/units';

export const RULER_SIZE = 20; // px — width/height of the ruler strip

interface Props {
  labelOffsetX: number;
  labelOffsetY: number;
  labelWidthMm: number;
  labelHeightMm: number;
  scale: number; // px/mm
  canvasWidth: number;
  canvasHeight: number;
  unit?: Unit;
  colors?: CanvasColors;
}

export function Ruler({
  labelOffsetX,
  labelOffsetY,
  labelWidthMm,
  labelHeightMm,
  scale,
  canvasWidth,
  canvasHeight,
  unit = 'mm',
  colors = DARK_COLORS,
}: Props) {
  const { major, minor } = rulerTicksMm(scale, unit);
  const els: React.ReactElement[] = [];

  // ── Backgrounds ───────────────────────────────────────────────
  els.push(
    <Rect key="bg-h" x={0} y={0} width={canvasWidth} height={RULER_SIZE}
      fill={colors.rulerBg} listening={false} />,
    <Rect key="bg-v" x={0} y={0} width={RULER_SIZE} height={canvasHeight}
      fill={colors.rulerBg} listening={false} />,
    <Rect key="bg-corner" x={0} y={0} width={RULER_SIZE} height={RULER_SIZE}
      fill={colors.rulerCorner} listening={false} />,
  );

  // ── Horizontal ruler (top) ─────────────────────────────────────
  // iterate in small steps, snap to minor grid
  const hSteps = Math.ceil(labelWidthMm / minor);
  for (let i = 0; i <= hSteps; i++) {
    const mm = Math.round(i * minor * 1000) / 1000;
    if (mm > labelWidthMm + minor / 2) break;
    const x = labelOffsetX + mm * scale;
    const isMajor = Math.round(mm * 1000) % Math.round(major * 1000) < 1;
    const tickH = isMajor ? 8 : 4;
    els.push(
      <Line key={`hr-${i}`}
        points={[x, RULER_SIZE - tickH, x, RULER_SIZE]}
        stroke={isMajor ? colors.rulerMajorTick : colors.rulerMinorTick}
        strokeWidth={isMajor ? 1 : 0.5}
        listening={false} />,
    );
    if (isMajor && mm > 0) {
      els.push(
        <Text key={`ht-${i}`}
          x={x + 2} y={RULER_SIZE - 14}
          text={rulerLabel(mm, unit)}
          fontSize={8} fill={colors.rulerLabel}
          fontFamily="'IBM Plex Mono', monospace"
          listening={false} />,
      );
    }
  }

  // ── Vertical ruler (left) ─────────────────────────────────────
  const vSteps = Math.ceil(labelHeightMm / minor);
  for (let i = 0; i <= vSteps; i++) {
    const mm = Math.round(i * minor * 1000) / 1000;
    if (mm > labelHeightMm + minor / 2) break;
    const y = labelOffsetY + mm * scale;
    const isMajor = Math.round(mm * 1000) % Math.round(major * 1000) < 1;
    const tickW = isMajor ? 8 : 4;
    els.push(
      <Line key={`vr-${i}`}
        points={[RULER_SIZE - tickW, y, RULER_SIZE, y]}
        stroke={isMajor ? colors.rulerMajorTick : colors.rulerMinorTick}
        strokeWidth={isMajor ? 1 : 0.5}
        listening={false} />,
    );
    if (isMajor && mm > 0) {
      els.push(
        <Text key={`vt-${i}`}
          x={2} y={y + 2}
          text={rulerLabel(mm, unit)}
          fontSize={8} fill={colors.rulerLabel}
          fontFamily="'IBM Plex Mono', monospace"
          rotation={0}
          listening={false} />,
      );
    }
  }

  // ── Separator lines ───────────────────────────────────────────
  els.push(
    <Line key="sep-h" points={[RULER_SIZE, RULER_SIZE, canvasWidth, RULER_SIZE]}
      stroke={colors.rulerSeparator} strokeWidth={1} listening={false} />,
    <Line key="sep-v" points={[RULER_SIZE, RULER_SIZE, RULER_SIZE, canvasHeight]}
      stroke={colors.rulerSeparator} strokeWidth={1} listening={false} />,
  );

  return <Group listening={false}>{els}</Group>;
}
