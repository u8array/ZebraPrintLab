import type { ObjectTypeUi } from '../types/ObjectType';
import type { Translations } from '../locales';
import { useT } from '../lib/useT';
import { labelCls } from '../components/Properties/styles';
import { filterContent, hasValidLength, type ContentSpec } from './contentSpec';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import { TemplateContentInput } from '../components/Properties/TemplateContentInput';
import { SectionCard, StaticSectionCard } from '../components/Properties/SectionCard';
import { FieldLabel, ZplCmd } from '../components/Properties/ZplCmd';
import { EanInlineStatus } from '../components/Properties/EanInlineStatus';
import type { EanUpcType } from '../lib/eanUpcValidate';
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
  /** Symbology supports the HRI above/below toggle (ZPL g-param). */
  hriAboveConfigurable?: boolean;
  /** The symbology's ZPL command (e.g. `^BC`), shown as a per-field tag when
   *  showZplCommands is on. Height / HRI / check-digit / rotation are params
   *  of this command; module width is `^BY`, content is `^FD`. */
  zplCommand: string;
  /** Opt-in: show the inline EAN/UPC length + check-digit helper under the
   *  content field (fixed-digit symbologies only). */
  eanValidation?: EanUpcType;
}

export function createBarcode1DPanel(config: Barcode1DPanelConfig): ObjectTypeUi<Barcode1DProps> {
  return {
    PropertiesPanel: ({ obj, onChange }) => {
      const t = useT();
      const loc = config.locale(t);
      const p = obj.props;
      return (
        <>
          <StaticSectionCard title={t.properties.contentSection}>
            <div className="flex flex-col gap-1">
              <FieldLabel cmd="^FD">{loc.content}</FieldLabel>
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
              {!config.eanValidation && !hasValidLength(p.content, config.contentSpec) && loc.placeholder && (
                <p className="font-mono text-[10px] text-warning">{loc.placeholder}</p>
              )}
              {config.eanValidation && (
                <EanInlineStatus type={config.eanValidation} content={p.content} />
              )}
            </div>
          </StaticSectionCard>

          <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
            <NumberInput
              label={loc.height}
              value={p.height}
              min={1}
              disabled={config.heightLocked}
              readOnly={config.heightLocked}
              onChange={(height) => onChange({ height })}
              zplCmd={config.zplCommand}
            />

            <NumberInput
              label={loc.moduleWidth}
              value={p.moduleWidth}
              min={1}
              max={10}
              onChange={(moduleWidth) => onChange({ moduleWidth })}
              zplCmd="^BY"
            />

            {!config.interpretationLocked && (
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={p.printInterpretation}
                    onChange={(e) => onChange({ printInterpretation: e.target.checked })}
                  />
                  <span className={labelCls}>{loc.printInterpretation}</span>
                </label>
                <ZplCmd cmd={config.zplCommand} />
              </div>
            )}

            {!config.interpretationLocked && config.hriAboveConfigurable && p.printInterpretation && (
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={p.printInterpretationAbove ?? false}
                    onChange={(e) => onChange({ printInterpretationAbove: e.target.checked })}
                  />
                  <span className={labelCls}>{t.registry.text.hriAbove}</span>
                </label>
                <ZplCmd cmd={config.zplCommand} />
              </div>
            )}

            {config.hasCheckDigit && (
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={p.checkDigit}
                    onChange={(e) => onChange({ checkDigit: e.target.checked })}
                  />
                  <span className={labelCls}>{loc.checkDigit}</span>
                </label>
                <ZplCmd cmd={config.zplCommand} />
              </div>
            )}

            <RotationSelect
              value={p.rotation}
              onChange={(rotation) => onChange({ rotation })}
              zplCmd={config.zplCommand}
            />
          </SectionCard>
        </>
      );
    },
  };
}
