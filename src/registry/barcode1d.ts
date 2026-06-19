import type { ObjectGroup } from '../types/LabelObject';
import type { ObjectTypeCore } from '../types/ObjectType';
import type { HriBehavior } from '../types/ZplEmit';
import { fieldPos, fdFieldFor } from './zplHelpers';
import { commitBarcodeWidthHeightTransform } from './transformHelpers';
import { type ZplRotation } from './rotation';

export interface Barcode1DProps {
  content: string;
  height: number;
  moduleWidth: number;
  printInterpretation: boolean;
  /** HRI above the bars (ZPL g-param) instead of below; default false. */
  printInterpretationAbove?: boolean;
  checkDigit: boolean;
  rotation: ZplRotation;
}

export interface Barcode1DCoreConfig {
  label: string;
  icon: string;
  defaultContent: string;
  /** Build the ZPL barcode command (e.g. `^BUN,100,Y,N,N`). */
  zplCommand: (p: Barcode1DProps) => string;
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
  /** See {@link HriBehavior}. */
  hri?: HriBehavior;
  /** Transform stored content into the ^FD payload (e.g. UPC-E prepends
   *  the number-system digit the spec requires). Default: identity. */
  fdContent?: (content: string) => string;
}

export function createBarcode1DCore(config: Barcode1DCoreConfig): ObjectTypeCore<Barcode1DProps> {
  const defaultProps: Barcode1DProps = {
    content: config.defaultContent,
    height: 100,
    moduleWidth: 2,
    printInterpretation: !config.interpretationLocked,
    printInterpretationAbove: false,
    checkDigit: false,
    rotation: 'N',
  };
  // Single source for the palette command icon: derive the `^Bx` prefix from
  // the same zplCommand the generator uses, so there's no second literal.
  const zplCmd = config.zplCommand(defaultProps).match(/^\^[A-Z0-9]{2}/)?.[0];
  return {
    label: config.label,
    icon: config.icon,
    zplCmd,
    group: config.group,
    bindable: true,
    defaultProps,
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
      // g (HRI above) is only valid when f (interpretation) is on, and
      // interpretationLocked symbologies (e.g. ^BR) have no HRI in ZPL at all.
      // Normalize both so a stale/legacy prop never emits an out-of-spec flag.
      const printInterpretation =
        !config.interpretationLocked && obj.props.printInterpretation;
      const p = {
        ...obj.props,
        printInterpretation,
        printInterpretationAbove:
          printInterpretation && obj.props.printInterpretationAbove,
      };
      const byCmd = config.byRatio !== undefined
        ? `^BY${p.moduleWidth},${config.byRatio}`
        : `^BY${p.moduleWidth}`;
      return [
        byCmd,
        fieldPos(obj),
        config.zplCommand(p),
        fdFieldFor(obj, config.fdContent ? config.fdContent(p.content) : p.content, ctx),
      ].filter(Boolean).join('');
    },
  };
}
