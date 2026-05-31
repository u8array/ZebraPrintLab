import type { ObjectGroup } from '../types/LabelObject';
import type { ObjectTypeCore } from '../types/ObjectType';
import type { HriBehavior } from '../types/ZplEmit';
import type { Translations } from '../locales';
import { fieldPos, fdFieldFor } from './zplHelpers';
import { commitBarcodeWidthHeightTransform } from './transformHelpers';
import { type ContentSpec } from './contentSpec';
import { type ZplRotation } from './rotation';

export interface Barcode1DProps {
  content: string;
  height: number;
  moduleWidth: number;
  printInterpretation: boolean;
  checkDigit: boolean;
  rotation: ZplRotation;
}

/** Per-symbology locale block: labels rendered by the panel. */
export interface BarcodeLocale {
  content: string;
  height: string;
  moduleWidth: string;
  printInterpretation: string;
  checkDigit?: string;
  placeholder?: string;
}

/** Per-symbology config consumed by both `createBarcode1DCore` and
 *  `createBarcode1DPanel`. Single shape per entry; each factory reads
 *  the subset it needs. TODO Stage 7: split into Core / Panel halves so
 *  the `.ts` doesn't carry `locale` / `contentSpec` (panel-only). */
export interface Barcode1DConfig {
  label: string;
  icon: string;
  defaultContent: string;
  hasCheckDigit: boolean;
  /** Build the ZPL barcode command (e.g. `^BUN,100,Y,N,N`). */
  zplCommand: (p: Barcode1DProps) => string;
  /** Per-symbology locale selector — TS verifies the returned shape
   *  conforms to BarcodeLocale at every call site. */
  locale: (t: Translations) => BarcodeLocale;
  group: ObjectGroup;
  /**
   * Explicit wide-to-narrow ratio for the ^BY command.
   * ZPL defaults to 3.0, but some barcode standards (MSI, Plessey) define a
   * fixed 2:1 ratio, which bwip-js also hardcodes internally. Setting byRatio
   * here ensures Labelary uses the same ratio as the canvas rendering.
   */
  byRatio?: number;
  /** See {@link ObjectTypeCore.heightLocked}. */
  heightLocked?: boolean;
  /** See {@link ObjectTypeCore.interpretationLocked}. */
  interpretationLocked?: boolean;
  /** Restrict allowed input characters; see {@link ContentSpec}. */
  contentSpec?: ContentSpec;
  /** See {@link HriBehavior}. */
  hri?: HriBehavior;
}

export function createBarcode1DCore(config: Barcode1DConfig): ObjectTypeCore<Barcode1DProps> {
  return {
    label: config.label,
    icon: config.icon,
    group: config.group,
    bindable: true,
    defaultProps: {
      content: config.defaultContent,
      height: 100,
      moduleWidth: 2,
      printInterpretation: !config.interpretationLocked,
      checkDigit: false,
      rotation: 'N',
    },
    defaultSize: { width: 300, height: 120 },
    heightLocked: config.heightLocked,
    interpretationLocked: config.interpretationLocked,
    hri: config.hri,

    // heightLocked symbologies disable the transformer entirely; others scale
    // bar height with sy and module width with sx (clamped in the helper).
    commitTransform: config.heightLocked
      ? undefined
      : commitBarcodeWidthHeightTransform,

    toZPL: (obj, ctx) => {
      // Normalize printInterpretation for symbologies that have no HRI in ZPL
      // (e.g. ^BR). Protects legacy saved objects that still carry
      // printInterpretation: true from emitting an out-of-spec flag.
      const p = config.interpretationLocked
        ? { ...obj.props, printInterpretation: false }
        : obj.props;
      const byCmd = config.byRatio !== undefined
        ? `^BY${p.moduleWidth},${config.byRatio}`
        : `^BY${p.moduleWidth}`;
      return [
        byCmd,
        fieldPos(obj),
        config.zplCommand(p),
        fdFieldFor(obj, p.content, ctx),
      ].filter(Boolean).join('');
    },
  };
}
