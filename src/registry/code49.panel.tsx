import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import { SectionCard, StaticSectionCard } from '../components/Properties/SectionCard';
import { FieldLabel, ZplCmd } from '../components/Properties/ZplCmd';
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
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label={loc.height}
              value={p.height}
              min={code49MinHeight(p.moduleWidth)}
              max={code49MaxHeight(p.moduleWidth)}
              onChange={(height) => onChange({ height })}
              zplCmd="^B4"
            />
            <NumberInput
              label={loc.moduleWidth}
              value={p.moduleWidth}
              min={1}
              max={10}
              onChange={(moduleWidth) => onChange({ moduleWidth })}
              zplCmd="^BY"
            />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel cmd="^B4">{loc.mode}</FieldLabel>
            <select
              className={inputCls}
              value={p.mode}
              onChange={(e) => onChange({ mode: e.target.value as Code49Mode })}
            >
              {CODE49_MODES.map((m) => (
                <option key={m} value={m}>
                  {m === 'A' ? `A — ${loc.modeAuto}` : m}
                </option>
              ))}
            </select>
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
