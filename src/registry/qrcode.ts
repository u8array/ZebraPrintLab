import type { ObjectTypeCore } from '../types/ObjectType';
import type { LabelObjectBase } from '../types/LabelObject';
import { fieldPos, fdFieldFor } from './zplHelpers';
import { type ZplRotation } from './rotation';

/** ZPL prefixes the QR payload with `{ec}A,` inside ^FD. Shared by toZPL and
 *  the CSV batch override so a per-row value also gets the prefix. */
const qrFdTransform =
  (obj: LabelObjectBase & { props: QrCodeProps }) =>
  (s: string): string =>
    `${obj.props.errorCorrection}A,${s}`;

export const MAGNIFICATION_MIN = 1;
export const MAGNIFICATION_MAX = 10;

export interface QrCodeProps {
  content: string;
  magnification: number;       // dot size per module
  errorCorrection: 'H' | 'Q' | 'M' | 'L';
  /** ^BQ b: 1 = original, 2 = enhanced (recommended, default). */
  model: 1 | 2;
  rotation: ZplRotation;
}

export const qrcode: ObjectTypeCore<QrCodeProps> = {
  label: 'QR Code',
  icon: '⬚',
  zplCmd: '^BQ',
  group: 'code-2d',
  bindable: true,
  defaultProps: {
    content: 'https://example.com',
    magnification: 4,
    errorCorrection: 'Q',
    model: 2,
    rotation: 'N',
  },
  defaultSize: { width: 200, height: 200 },

  uniformScaleProp: { name: 'magnification', min: MAGNIFICATION_MIN, max: MAGNIFICATION_MAX },

  fdTransform: qrFdTransform,

  toZPL: (obj, ctx) => {
    const p = obj.props;
    // Prefix passed as the fdFieldFor transform (not baked into content) so it
    // composes with the binding: single-bind default / template / CSV override
    // all get the prefix instead of the payload being emitted raw.
    return [
      fieldPos(obj),
      `^BQ${p.rotation},${p.model},${p.magnification}`,
      fdFieldFor(obj, p.content, ctx, qrFdTransform(obj)),
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
