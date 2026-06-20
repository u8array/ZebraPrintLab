import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { useLabelStore } from '../store/labelStore';
import { inputCls } from '../components/Properties/styles';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import { SectionCard, StaticSectionCard } from '../components/Properties/SectionCard';
import { FieldLabel } from '../components/Properties/ZplCmd';
import { type QrCodeProps, MAGNIFICATION_MIN, MAGNIFICATION_MAX } from './qrcode';

export const qrcodePanel: ObjectTypeUi<QrCodeProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const openContentBuilder = useLabelStore((s) => s.openContentBuilder);
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection} cmd="^FD">
          {/* textarea, not input: typed content (vCard) carries real newlines. */}
          <textarea
            className={`${inputCls} resize-y min-h-9`}
            aria-label={t.registry.qrcode.content}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
          <button
            type="button"
            onClick={() => openContentBuilder(obj.id)}
            className="self-start text-xs px-2 py-1 rounded border border-border bg-surface-2 hover:bg-border transition-colors"
          >
            {t.contentBuilder.button}
          </button>
        </StaticSectionCard>

        <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
          <NumberInput
            label={t.registry.qrcode.magnification}
            value={p.magnification}
            min={MAGNIFICATION_MIN}
            max={MAGNIFICATION_MAX}
            onChange={(magnification) => onChange({ magnification })}
            zplCmd="^BQ"
          />

          <div className="flex flex-col gap-1">
            <FieldLabel cmd="^BQ">{t.registry.qrcode.errorCorrection}</FieldLabel>
            <select
              className={inputCls}
              value={p.errorCorrection}
              onChange={(e) => onChange({ errorCorrection: e.target.value as QrCodeProps['errorCorrection'] })}
            >
              <option value="L">{t.registry.qrcode.ecL}</option>
              <option value="M">{t.registry.qrcode.ecM}</option>
              <option value="Q">{t.registry.qrcode.ecQ}</option>
              <option value="H">{t.registry.qrcode.ecH}</option>
            </select>
          </div>

          <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} zplCmd="^BQ" />
        </SectionCard>
      </>
    );
  },
};
