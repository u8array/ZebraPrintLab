import type { ObjectTypeUi } from '../types/ObjectType';
import type { Translations } from '../locales';
import { useT } from '../lib/useT';
import { labelCls } from '../components/Properties/styles';
import { filterContent, hasValidLength, type ContentSpec } from './contentSpec';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import { TemplateContentInput } from '../components/Properties/TemplateContentInput';
import type { Barcode1DProps } from './barcode1d';

/** Per-symbology locale block: labels rendered by the panel. */
export interface BarcodeLocale {
  content: string;
  height: string;
  moduleWidth: string;
  printInterpretation: string;
  checkDigit?: string;
  placeholder?: string;
}

export interface Barcode1DPanelConfig {
  locale: (t: Translations) => BarcodeLocale;
  hasCheckDigit: boolean;
  contentSpec?: ContentSpec;
  heightLocked?: boolean;
  interpretationLocked?: boolean;
}

export function createBarcode1DPanel(config: Barcode1DPanelConfig): ObjectTypeUi<Barcode1DProps> {
  return {
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
                // Preserve `«name»` markers; sanitise the literal slices between them.
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
