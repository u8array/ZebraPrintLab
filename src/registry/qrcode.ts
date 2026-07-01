import type { ObjectTypeCore } from '../types/ObjectType';
import type { LabelObjectBase } from '../types/LabelObject';
import { fieldPos, fdFieldFor } from './zplHelpers';
import { moduleTooSmallPreflight } from '../lib/barcodeScannability';
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

  preflight: moduleTooSmallPreflight<QrCodeProps>('magnification'),

  fdTransform: qrFdTransform,

  toZPL: (obj, ctx) => {
    const p = obj.props;
    // Prefix passed as the fdFieldFor transform (not baked into content) so it
    // composes with the binding: single-bind default / template / CSV override
    // all get the prefix instead of the payload being emitted raw.
    return [
      fieldPos(obj),
      `^BQ${p.rotation},${p.model},${p.magnification}`,
      fdFieldFor(p.content, ctx, qrFdTransform(obj)),
    ].join('');
  },
};
