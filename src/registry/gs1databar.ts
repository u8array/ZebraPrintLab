import type { LabelObjectBase } from '../types/LabelObject';
import type { ObjectTypeCore } from '../types/ObjectType';
import { fieldPos, fdFieldFor } from './zplHelpers';
import { type ZplRotation } from './rotation';
import { GS1_DATABAR_DEFAULT_SEGMENTS } from '../lib/gs1';

export interface Gs1DatabarProps {
  content: string;
  /** ^BR p[2] magnification multiplier (1-10). Generator emits the
   *  same value to ^BY moduleWidth by Zebra convention. */
  magnification: number;
  symbology: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  segments?: number;
  rotation: ZplRotation;
}

// ZPL ^BR height parameter. Zebra firmware overrides this with each variant's
// intrinsic bar height for sym 1–5; only Expanded Stacked (sym 7) uses it as
// per-row height. Hardcoded because heightLocked: true forbids resizing.
const ZPL_HEIGHT_PLACEHOLDER = 100;

// GS1 standard variant names. Kept in source rather than i18n because the spec
// defines them as proper nouns (matches the convention used for barcode-type
// labels like "GS1 Databar", "PDF417" in src/locales).
export const SYMBOLOGY_LABELS: Record<Gs1DatabarProps['symbology'], string> = {
  1: 'Omnidirectional',
  2: 'Truncated',
  3: 'Stacked',
  4: 'Stacked Omni',
  5: 'Limited',
  6: 'Expanded',
  7: 'Expanded Stacked',
};

export const gs1databar: ObjectTypeCore<Gs1DatabarProps> = {
  label: 'GS1 Databar',
  icon: 'GS1',
  group: 'code-1d',
  bindable: true,
  defaultProps: {
    content: '0112345678901',
    magnification: 2,
    symbology: 1,
    rotation: 'N',
  },
  defaultSize: { width: 300, height: 120 },
  heightLocked: true,

  toZPL: (obj: LabelObjectBase & { props: Gs1DatabarProps }, ctx) => {
    const p = obj.props;
    // ^BRo,s,m,sep,h[,sg]: segments must only be present for Expanded Stacked (7).
    // Including segments on sym 1–6 makes Labelary stack the symbol (wrong rendering).
    const segs = p.symbology === 7 ? `,${p.segments ?? GS1_DATABAR_DEFAULT_SEGMENTS}` : '';
    return `^BY${p.magnification}${fieldPos(obj)}^BR${p.rotation},${p.symbology},${p.magnification},2,${ZPL_HEIGHT_PLACEHOLDER}${segs}${fdFieldFor(obj, p.content, ctx)}`;
  },
};
