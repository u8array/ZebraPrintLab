import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { useLabelStore } from '../store/labelStore';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import { SectionCard, StaticSectionCard } from '../components/Properties/SectionCard';
import { VariableContentField } from '../components/Properties/VariableContentField';
import { FieldLabel } from '../components/Properties/ZplCmd';
import { Select } from '../components/ui/Select';
import { builderButtonCls } from '../components/ui/formStyles';
import { fieldHasVariable, asLabelObject } from '../lib/variableField';
import { type QrCodeProps, MAGNIFICATION_MIN, MAGNIFICATION_MAX } from './qrcode';

export const qrcodePanel: ObjectTypeUi<QrCodeProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const openContentBuilder = useLabelStore((s) => s.openContentBuilder);
    const showZpl = useLabelStore((s) => s.showZplCommands);
    const variables = useLabelStore((s) => s.variables);
    // The typed-content builder writes a literal string; it can't coexist with
    // variable chips, so it's disabled once the field carries a variable.
    const bound = fieldHasVariable(asLabelObject(obj), variables);
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection} cmd="^FD">
          <VariableContentField obj={obj} multiline placeholder={t.registry.qrcode.content} />
          <button type="button" disabled={bound} onClick={() => openContentBuilder(obj.id)} className={builderButtonCls}>
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
            <Select<QrCodeProps['errorCorrection']>
              value={p.errorCorrection}
              onChange={(errorCorrection) => onChange({ errorCorrection })}
              aria-label={t.registry.qrcode.errorCorrection}
              groups={[{ options: [
                { value: 'L', label: t.registry.qrcode.ecL, badge: showZpl ? 'L' : undefined },
                { value: 'M', label: t.registry.qrcode.ecM, badge: showZpl ? 'M' : undefined },
                { value: 'Q', label: t.registry.qrcode.ecQ, badge: showZpl ? 'Q' : undefined },
                { value: 'H', label: t.registry.qrcode.ecH, badge: showZpl ? 'H' : undefined },
              ] }]}
            />
          </div>

          {showZpl && (
            <div className="flex flex-col gap-1">
              <FieldLabel cmd="^BQ">{t.registry.qrcode.model}</FieldLabel>
              <Select<QrCodeProps['model']>
                value={p.model}
                onChange={(model) => onChange({ model })}
                aria-label={t.registry.qrcode.model}
                groups={[{ options: [
                  { value: 2, label: t.registry.qrcode.modelEnhanced, badge: '2' },
                  { value: 1, label: t.registry.qrcode.modelOriginal, badge: '1' },
                ] }]}
              />
              <span className="text-[10px] text-muted">{t.registry.qrcode.modelHint}</span>
            </div>
          )}

          <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} zplCmd="^BQ" />
        </SectionCard>
      </>
    );
  },
};
