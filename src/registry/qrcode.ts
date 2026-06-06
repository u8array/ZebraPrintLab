import type { ObjectTypeCore } from '../types/ObjectType';
import { fieldPos, fdFieldFor } from './zplHelpers';
import { commitUniformScaleTransform } from './transformHelpers';
import { type ZplRotation } from './rotation';

export const MAGNIFICATION_MIN = 1;
export const MAGNIFICATION_MAX = 10;

export interface QrCodeProps {
  content: string;
  magnification: number;       // dot size per module
  errorCorrection: 'H' | 'Q' | 'M' | 'L';
  rotation: ZplRotation;
}

export const qrcode: ObjectTypeCore<QrCodeProps> = {
  label: 'QR Code',
  icon: '⬚',
  group: 'code-2d',
  bindable: true,
  defaultProps: {
    content: 'https://example.com',
    magnification: 4,
    errorCorrection: 'Q',
    rotation: 'N',
  },
  defaultSize: { width: 200, height: 200 },

  commitTransform: commitUniformScaleTransform('magnification', MAGNIFICATION_MIN, MAGNIFICATION_MAX),

  toZPL: (obj, ctx) => {
    const p = obj.props;
    // ZPL prefixes the QR payload with `{ec}A,` inside ^FD. When the field
    // is bound to a variable, the variable's defaultValue stands in for the
    // full payload including that prefix; Phase 1 keeps fdFieldFor honest
    // and one-shot; smarter QR-data-only binding is a Phase 2 concern.
    return [
      fieldPos(obj),
      `^BQ${p.rotation},2,${p.magnification}`,
      fdFieldFor(obj, `${p.errorCorrection}A,${p.content}`, ctx),
    ].join('');
  },

  // Zebra firmware adds a hardcoded +10 dot Y-offset to ^FO QR codes; Labelary
  // does not handle negative y values cleanly (^FO0,-10 renders at image y=20,
  // not y=0). Clamping y >= 0 here keeps the designer's visual position in sync
  // with Labelary preview. Only applies when y is being explicitly changed;
  // existing negative values from ZPL import are preserved until edited.
  normalizeChanges: (obj, changes) => {
    if (changes.y === undefined || changes.y >= 0) return changes;
    const positionType = changes.positionType ?? obj.positionType;
    return positionType === 'FT' ? changes : { ...changes, y: 0 };
  },
};
