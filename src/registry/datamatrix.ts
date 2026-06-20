import type { ObjectTypeCore } from '../types/ObjectType';
import { fieldPos, fdFieldFor } from './zplHelpers';
import { GS1_DATAMATRIX_ESCAPE, gs1ContentToDataMatrixFd } from '../lib/gs1';
import { type ZplRotation } from './rotation';

export const DIMENSION_MIN = 1;
export const DIMENSION_MAX = 12;

export interface DataMatrixProps {
  content: string;
  dimension: number;   // module size in dots
  quality: 0 | 50 | 80 | 140 | 200;  // 0 = auto
  rotation: ZplRotation;
  /** GS1 DataMatrix mode: content is a GS1 element string; emit a leading FNC1
   *  and GS separators via the ^BX escape param (g=_). */
  gs1: boolean;
}

export const datamatrix: ObjectTypeCore<DataMatrixProps> = {
  label: 'DataMatrix',
  icon: '▦',
  zplCmd: '^BX',
  group: 'code-2d',
  bindable: true,
  defaultProps: {
    content: '1234567890',
    dimension: 5,
    quality: 200,
    rotation: 'N',
    gs1: false,
  },
  defaultSize: { width: 150, height: 150 },

  uniformScaleProp: { name: 'dimension', min: DIMENSION_MIN, max: DIMENSION_MAX },

  toZPL: (obj, ctx) => {
    const p = obj.props;
    if (p.gs1) {
      // g=_ sets the escape char; field data carries `_1` FNC1 separators.
      // The transform composes with ^FN/variable binding via fdFieldFor.
      return [
        fieldPos(obj),
        `^BX${p.rotation},${p.dimension},${p.quality},,,,${GS1_DATAMATRIX_ESCAPE}`,
        fdFieldFor(obj, p.content, ctx, gs1ContentToDataMatrixFd),
      ].join('');
    }
    return [
      fieldPos(obj),
      `^BX${p.rotation},${p.dimension},${p.quality}`,
      fdFieldFor(obj, p.content, ctx),
    ].join('');
  },
};
