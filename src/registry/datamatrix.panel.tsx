import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls } from '../components/Properties/styles';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import { SectionCard, StaticSectionCard } from '../components/Properties/SectionCard';
import { FieldLabel } from '../components/Properties/ZplCmd';
import { type DataMatrixProps, DIMENSION_MIN, DIMENSION_MAX } from './datamatrix';

export const datamatrixPanel: ObjectTypeUi<DataMatrixProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection} cmd="^FD">
          <input
            className={inputCls}
            aria-label={t.registry.datamatrix.content}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </StaticSectionCard>

        <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
          <NumberInput
            label={t.registry.datamatrix.dimension}
            value={p.dimension}
            min={DIMENSION_MIN}
            max={DIMENSION_MAX}
            onChange={(dimension) => onChange({ dimension })}
            zplCmd="^BX"
          />

          <div className="flex flex-col gap-1">
            <FieldLabel cmd="^BX">{t.registry.datamatrix.quality}</FieldLabel>
            <select
              className={inputCls}
              value={p.quality}
              onChange={(e) => onChange({ quality: Number(e.target.value) as DataMatrixProps['quality'] })}
            >
              <option value={0}>{t.registry.datamatrix.qualityAuto}</option>
              <option value={50}>{t.registry.datamatrix.quality50}</option>
              <option value={80}>{t.registry.datamatrix.quality80}</option>
              <option value={140}>{t.registry.datamatrix.quality140}</option>
              <option value={200}>{t.registry.datamatrix.quality200}</option>
            </select>
          </div>

          <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} zplCmd="^BX" />
        </SectionCard>
      </>
    );
  },
};
