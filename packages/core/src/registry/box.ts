import type { ObjectTypeCore } from '../types/ObjectType';
import { wrapReverse, graphicFieldPos } from './zplHelpers';
import { commitWidthHeightTransform } from './transformHelpers';

export interface BoxProps {
  width: number;
  height: number;
  thickness: number;
  filled: boolean;
  color: 'B' | 'W';
  rounding: number;
  reverse?: boolean;
}

export const box: ObjectTypeCore<BoxProps> = {
  label: 'Box',
  icon: '□',
  zplCmd: '^GB',
  group: 'shape',
  defaultProps: {
    width: 200,
    height: 100,
    thickness: 3,
    filled: false,
    color: 'B',
    rounding: 0,
  },
  defaultSize: { width: 200, height: 100 },

  commitTransform: commitWidthHeightTransform,

  toZPL: (obj) => {
    const p = obj.props;
    // Emit `thickness` verbatim so a ZPL round-trip is lossless. Only
    // floor it up to `min(w,h)` when the user toggled `filled` but the
    // stored thickness is below the firmware's solid threshold.
    const solidThreshold = Math.min(p.width, p.height);
    const t = p.filled
      ? Math.max(p.thickness, solidThreshold)
      : p.thickness;
    return wrapReverse(
      p.reverse,
      `${graphicFieldPos(obj, p.width, p.height)}^GB${p.width},${p.height},${t},${p.color},${p.rounding}^FS`,
    );
  },
};
