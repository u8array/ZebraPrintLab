import { Group, Line } from 'react-konva';
import type { SnapGuide } from '../../lib/snapGuides';

// Soft indigo — visible on white labels without being aggressive
const COLOR = '#818cf8';
const TICK = 4; // half-length of tick marks on spacing guides

interface Props {
  guides: SnapGuide[];
}

export function GuideLines({ guides }: Props) {
  return (
    <>
      {guides.map((g, i) => {
        const isV = g.orientation === 'V';
        const mainPoints = isV
          ? [g.pos, g.from, g.pos, g.to]
          : [g.from, g.pos, g.to, g.pos];

        if (g.type === 'align') {
          return (
            <Line
              key={i}
              points={mainPoints}
              stroke={COLOR}
              strokeWidth={1}
              opacity={0.8}
              listening={false}
            />
          );
        }

        // Spacing guide: dashed line + tick marks at both ends
        const tickFrom = isV
          ? [g.pos - TICK, g.from, g.pos + TICK, g.from]
          : [g.from, g.pos - TICK, g.from, g.pos + TICK];
        const tickTo = isV
          ? [g.pos - TICK, g.to, g.pos + TICK, g.to]
          : [g.to, g.pos - TICK, g.to, g.pos + TICK];

        return (
          <Group key={i} listening={false}>
            <Line points={mainPoints} stroke={COLOR} strokeWidth={1} opacity={0.7} dash={[4, 3]} listening={false} />
            <Line points={tickFrom}   stroke={COLOR} strokeWidth={1} opacity={0.7} listening={false} />
            <Line points={tickTo}     stroke={COLOR} strokeWidth={1} opacity={0.7} listening={false} />
          </Group>
        );
      })}
    </>
  );
}
