import type { ObjectTypeCore } from '../types/ObjectType';
import { fieldPos, fdFieldFor } from './zplHelpers';
import { type ZplRotation } from './rotation';

export const DIMENSION_MIN = 1;
export const DIMENSION_MAX = 12;

export interface DataMatrixProps {
  content: string;
  dimension: number;   // module size in dots
  quality: 0 | 50 | 80 | 140 | 200;  // 0 = auto
  rotation: ZplRotation;
}

export const datamatrix: ObjectTypeCore<DataMatrixProps> = {
  label: 'DataMatrix',
  icon: '▦',
  group: 'code-2d',
  bindable: true,
  defaultProps: {
    content: '1234567890',
    dimension: 5,
    quality: 200,
    rotation: 'N',
  },
  defaultSize: { width: 150, height: 150 },

  uniformScaleProp: { name: 'dimension', min: DIMENSION_MIN, max: DIMENSION_MAX },

  toZPL: (obj, ctx) => {
    const p = obj.props;
    return [
      fieldPos(obj),
      `^BX${p.rotation},${p.dimension},${p.quality}`,
      fdFieldFor(obj, p.content, ctx),
    ].join('');
  },
};
