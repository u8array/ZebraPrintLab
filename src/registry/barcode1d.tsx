import type { ObjectTypeDefinition, ObjectGroup, LabelObjectBase, HriBehavior } from '../types/ObjectType';
import { useT } from '../lib/useT';
import type { Translations } from '../locales';
import { labelCls } from '../components/Properties/styles';
import { fieldPos, fdFieldFor } from './zplHelpers';
import { commitBarcodeWidthHeightTransform } from './transformHelpers';
import { filterContent, hasValidLength, type ContentSpec } from './contentSpec';
import { type ZplRotation } from './rotation';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import { TemplateContentInput } from '../components/Properties/TemplateContentInput';

export interface Barcode1DProps {
  content: string;
  height: number;
  moduleWidth: number;
  printInterpretation: boolean;
  checkDigit: boolean;
  rotation: ZplRotation;
}

interface Barcode1DConfig {
  label: string;
  icon: string;
  defaultContent: string;
  hasCheckDigit: boolean;
  /** Build the ZPL barcode command (e.g. `^BUN,100,Y,N,N`). */
  zplCommand: (p: Barcode1DProps) => string;
  /** Per-symbology locale block selector — TS verifies the returned shape
   *  conforms to BarcodeLocale at every call site, so a missing or renamed
   *  `t.registry.<key>` is a compile error rather than a runtime undefined. */
  locale: (t: Translations) => BarcodeLocale;
  group: ObjectGroup;
  /**
   * Explicit wide-to-narrow ratio for the ^BY command.
   * ZPL defaults to 3.0, but some barcode standards (MSI, Plessey) define a
   * fixed 2:1 ratio, which bwip-js also hardcodes internally. Setting byRatio
   * here ensures Labelary uses the same ratio as the canvas rendering.
   */
  byRatio?: number;
  /** See {@link ObjectTypeDefinition.heightLocked}. */
  heightLocked?: boolean;
  /** See {@link ObjectTypeDefinition.interpretationLocked}. */
  interpretationLocked?: boolean;
  /** Restrict allowed input characters; see {@link ContentSpec}. */
  contentSpec?: ContentSpec;
  /** See {@link HriBehavior}. */
  hri?: HriBehavior;
}

interface BarcodeLocale {
  content: string;
  height: string;
  moduleWidth: string;
  printInterpretation: string;
  checkDigit?: string;
  placeholder?: string;
}

export function createBarcode1D(config: Barcode1DConfig): ObjectTypeDefinition<Barcode1DProps> {
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

    // Width-locked symbologies (currently just heightLocked = true ones like
    // GS1 DataBar) keep undefined so the transformer is disabled entirely.
    // Otherwise the bar height scales with sy and the module width scales
    // with sx (clamped to [1, 10] in commitBarcodeWidthHeightTransform).
    commitTransform: config.heightLocked
      ? undefined
      : commitBarcodeWidthHeightTransform,

    toZPL: (obj: LabelObjectBase & { props: Barcode1DProps }, ctx) => {
      // Normalize printInterpretation for symbologies that have no HRI in ZPL
      // (e.g. ^BR). This protects against legacy saved objects that still carry
      // printInterpretation: true from emitting an out-of-spec interpretation flag.
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

    PropertiesPanel: ({ obj, onChange }) => {
      const t = useT();
      const loc = config.locale(t);
      const p = obj.props;
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{loc.content}</label>
            <TemplateContentInput
              objectId={obj.id}
              multiline={false}
              value={p.content}
              onChange={(content) => onChange({ content })}
              sanitise={(raw) =>
                // Preserve `«name»` template markers verbatim while
                // sanitising the literal slices between them — without
                // this guard, restricted-charset barcodes (e.g. EAN13
                // numeric-only) would strip the markers' guillemets on
                // every keystroke after insertion.
                raw
                  .split(/(«[^»]+»)/)
                  .map((s, i) =>
                    i % 2 === 0 ? filterContent(s, config.contentSpec) : s,
                  )
                  .join('')
              }
              maxLength={config.contentSpec?.maxLength}
              placeholder={loc.placeholder}
            />
            {!hasValidLength(p.content, config.contentSpec) && loc.placeholder && (
              <p className="font-mono text-[10px] text-amber-400">{loc.placeholder}</p>
            )}
          </div>

          <NumberInput
            label={loc.height}
            value={p.height}
            min={1}
            disabled={config.heightLocked}
            readOnly={config.heightLocked}
            onChange={(height) => onChange({ height })}
          />

          <NumberInput
            label={loc.moduleWidth}
            value={p.moduleWidth}
            min={1}
            max={10}
            onChange={(moduleWidth) => onChange({ moduleWidth })}
          />

          {!config.interpretationLocked && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-accent"
                checked={p.printInterpretation}
                onChange={(e) => onChange({ printInterpretation: e.target.checked })}
              />
              <span className={labelCls}>{loc.printInterpretation}</span>
            </label>
          )}

          {config.hasCheckDigit && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-accent"
                checked={p.checkDigit}
                onChange={(e) => onChange({ checkDigit: e.target.checked })}
              />
              <span className={labelCls}>{loc.checkDigit}</span>
            </label>
          )}

          <RotationSelect
            value={p.rotation}
            onChange={(rotation) => onChange({ rotation })}
          />
        </div>
      );
    },
  };
}
