import type { ObjectTypeDefinition, ObjectGroup, LabelObjectBase } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { fieldPos } from './zplHelpers';

export interface Barcode1DProps {
  content: string;
  height: number;
  moduleWidth: number;
  printInterpretation: boolean;
  checkDigit: boolean;
}

interface Barcode1DConfig {
  label: string;
  icon: string;
  defaultContent: string;
  contentMaxLength?: number;
  hasCheckDigit: boolean;
  /** Build the ZPL barcode command (e.g. `^BUN,100,Y,N,N`). */
  zplCommand: (p: Barcode1DProps) => string;
  /** Locale key under `t.registry[localeKey]`. Must match en.ts shape. */
  localeKey: string;
  group: ObjectGroup;
  /**
   * Explicit wide-to-narrow ratio for the ^BY command.
   * ZPL defaults to 3.0, but some barcode standards (MSI, Plessey) define a
   * fixed 2:1 ratio, which bwip-js also hardcodes internally. Setting byRatio
   * here ensures Labelary uses the same ratio as the canvas rendering.
   */
  byRatio?: number;
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
    defaultProps: {
      content: config.defaultContent,
      height: 100,
      moduleWidth: 2,
      printInterpretation: true,
      checkDigit: false,
    },
    defaultSize: { width: 300, height: 120 },

    commitTransform: (obj, { sy, snap }) => ({
      height: Math.max(1, snap(Math.round(obj.props.height * sy))),
    }),

    toZPL: (obj: LabelObjectBase & { props: Barcode1DProps }) => {
      const p = obj.props;
      const byCmd = config.byRatio !== undefined
        ? `^BY${p.moduleWidth},${config.byRatio}`
        : `^BY${p.moduleWidth}`;
      return [
        byCmd,
        fieldPos(obj),
        config.zplCommand(p),
        `^FD${p.content}^FS`,
      ].filter(Boolean).join('');
    },

    PropertiesPanel: ({ obj, onChange }) => {
      const t = useT();
      const loc = (t.registry as unknown as Record<string, BarcodeLocale>)[config.localeKey] ?? {} as BarcodeLocale;
      const p = obj.props;
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{loc.content}</label>
            <input
              className={inputCls}
              value={p.content}
              maxLength={config.contentMaxLength}
              placeholder={loc.placeholder}
              onChange={(e) => onChange({ content: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelCls}>{loc.height}</label>
            <input
              type="number"
              className={inputCls}
              value={p.height}
              min={1}
              onChange={(e) => onChange({ height: Number(e.target.value) })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelCls}>{loc.moduleWidth}</label>
            <input
              type="number"
              className={inputCls}
              value={p.moduleWidth}
              min={1}
              max={10}
              onChange={(e) => onChange({ moduleWidth: Number(e.target.value) })}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-accent"
              checked={p.printInterpretation}
              onChange={(e) => onChange({ printInterpretation: e.target.checked })}
            />
            <span className={labelCls}>{loc.printInterpretation}</span>
          </label>

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
        </div>
      );
    },
  };
}
