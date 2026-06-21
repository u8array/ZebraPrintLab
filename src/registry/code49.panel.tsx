import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import { UnitNumberInput } from '../components/Properties/UnitNumberInput';
import { SectionCard, StaticSectionCard } from '../components/Properties/SectionCard';
import { FieldLabel, ZplCmd } from '../components/Properties/ZplCmd';
import { Select } from '../components/ui/Select';
import { fieldGridCols, fieldGridCell } from '../components/ui/formStyles';
import {
  type Code49Props,
  type Code49Mode,
  CODE49_MODES,
  code49MinHeight,
  code49MaxHeight,
} from './code49';

export const code49Panel: ObjectTypeUi<Code49Props> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.code49;
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection} cmd="^FD">
          <input
            className={inputCls}
            aria-label={loc.content}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </StaticSectionCard>

        <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
          <div className={`grid grid-cols-2 ${fieldGridCols}`}>
            <UnitNumberInput
              label={loc.height}
              valueDots={p.height}
              minDots={code49MinHeight(p.moduleWidth)}
              maxDots={code49MaxHeight(p.moduleWidth)}
              onChangeDots={(height) => onChange({ height })}
              zplCmd="^B4"
              className={fieldGridCell}
            />
            <NumberInput
              label={loc.moduleWidth}
              value={p.moduleWidth}
              min={1}
              max={10}
              onChange={(moduleWidth) => onChange({ moduleWidth })}
              zplCmd="^BY"
              className={fieldGridCell}
            />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel cmd="^B4">{loc.mode}</FieldLabel>
            <Select<Code49Mode>
              value={p.mode}
              onChange={(mode) => onChange({ mode })}
              aria-label={loc.mode}
              groups={[{ options: CODE49_MODES.map((m) => ({
                value: m,
                label: m === 'A' ? `A - ${loc.modeAuto}` : m,
              })) }]}
            />
          </div>

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
            <ZplCmd cmd="^B4" />
          </div>

          <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} zplCmd="^B4" />
        </SectionCard>
      </>
    );
  },
};
