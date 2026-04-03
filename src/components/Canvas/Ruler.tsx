import { Group, Rect, Line, Text } from 'react-konva';

export const RULER_SIZE = 20; // px — Breite/Höhe des Lineal-Bereichs

interface Props {
  labelOffsetX: number;
  labelOffsetY: number;
  labelWidthMm: number;
  labelHeightMm: number;
  scale: number; // px/mm
  canvasWidth: number;
  canvasHeight: number;
}

// Adaptive Schrittweite: dichter bei größerem Scale
function tickStep(scale: number) {
  if (scale >= 10) return { major: 5, minor: 1 };
  if (scale >= 5)  return { major: 10, minor: 5 };
  return { major: 20, minor: 10 };
}

export function Ruler({
  labelOffsetX,
  labelOffsetY,
  labelWidthMm,
  labelHeightMm,
  scale,
  canvasWidth,
  canvasHeight,
}: Props) {
  const { major, minor } = tickStep(scale);
  const els: React.ReactElement[] = [];

  // ── Hintergründe ──────────────────────────────────────────────
  els.push(
    <Rect key="bg-h" x={0} y={0} width={canvasWidth} height={RULER_SIZE}
      fill="#13131a" listening={false} />,
    <Rect key="bg-v" x={0} y={0} width={RULER_SIZE} height={canvasHeight}
      fill="#13131a" listening={false} />,
    // Eckquadrat (Überschneidung)
    <Rect key="bg-corner" x={0} y={0} width={RULER_SIZE} height={RULER_SIZE}
      fill="#0c0c0f" listening={false} />,
  );

  // ── Horizontales Lineal (oben) ─────────────────────────────────
  for (let mm = 0; mm <= labelWidthMm; mm += minor) {
    const x = labelOffsetX + mm * scale;
    const isMajor = mm % major === 0;
    const tickH = isMajor ? 8 : 4;
    els.push(
      <Line key={`hr-${mm}`}
        points={[x, RULER_SIZE - tickH, x, RULER_SIZE]}
        stroke={isMajor ? '#6b6b7e' : '#3a3a4e'}
        strokeWidth={isMajor ? 1 : 0.5}
        listening={false} />,
    );
    if (isMajor && mm > 0) {
      els.push(
        <Text key={`ht-${mm}`}
          x={x + 2} y={RULER_SIZE - 14}
          text={`${mm}`}
          fontSize={8} fill="#5a5a72"
          fontFamily="'IBM Plex Mono', monospace"
          listening={false} />,
      );
    }
  }

  // ── Vertikales Lineal (links) ──────────────────────────────────
  for (let mm = 0; mm <= labelHeightMm; mm += minor) {
    const y = labelOffsetY + mm * scale;
    const isMajor = mm % major === 0;
    const tickW = isMajor ? 8 : 4;
    els.push(
      <Line key={`vr-${mm}`}
        points={[RULER_SIZE - tickW, y, RULER_SIZE, y]}
        stroke={isMajor ? '#6b6b7e' : '#3a3a4e'}
        strokeWidth={isMajor ? 1 : 0.5}
        listening={false} />,
    );
    if (isMajor && mm > 0) {
      els.push(
        <Text key={`vt-${mm}`}
          x={2} y={y + 2}
          text={`${mm}`}
          fontSize={8} fill="#5a5a72"
          fontFamily="'IBM Plex Mono', monospace"
          rotation={0}
          listening={false} />,
      );
    }
  }

  // ── Trennlinien ───────────────────────────────────────────────
  els.push(
    <Line key="sep-h" points={[RULER_SIZE, RULER_SIZE, canvasWidth, RULER_SIZE]}
      stroke="#22222e" strokeWidth={1} listening={false} />,
    <Line key="sep-v" points={[RULER_SIZE, RULER_SIZE, RULER_SIZE, canvasHeight]}
      stroke="#22222e" strokeWidth={1} listening={false} />,
  );

  return <Group listening={false}>{els}</Group>;
}
