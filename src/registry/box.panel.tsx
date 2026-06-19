import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { NumberInput } from '../components/Properties/NumberInput';
import { SectionCard } from '../components/Properties/SectionCard';
import { FieldLabel, ZplCmd } from '../components/Properties/ZplCmd';
import type { BoxProps } from './box';

export const boxPanel: ObjectTypeUi<BoxProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label={t.registry.box.width}
            value={p.width}
            min={1}
            onChange={(width) => onChange({ width })}
            zplCmd="^GB"
          />
          <NumberInput
            label={t.registry.box.height}
            value={p.height}
            min={1}
            onChange={(height) => onChange({ height })}
            zplCmd="^GB"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-accent"
              checked={p.filled}
              onChange={(e) => onChange({ filled: e.target.checked })}
            />
            <span className={labelCls}>{t.registry.box.filled}</span>
          </label>
          <ZplCmd cmd="^GB" />
        </div>

        {!p.filled && (
          <NumberInput
            label={t.registry.box.thickness}
            value={p.thickness}
            min={1}
            onChange={(thickness) => onChange({ thickness })}
            zplCmd="^GB"
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <FieldLabel cmd="^GB">{t.registry.box.color}</FieldLabel>
            <select
              className={inputCls}
              value={p.color}
              onChange={(e) => onChange({ color: e.target.value as BoxProps['color'] })}
            >
              <option value="B">{t.registry.box.colorB}</option>
              <option value="W">{t.registry.box.colorW}</option>
            </select>
          </div>
          <NumberInput
            label={t.registry.box.rounding}
            value={p.rounding}
            min={0}
            max={8}
            onChange={(rounding) => onChange({ rounding })}
            zplCmd="^GB"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-accent"
              checked={p.reverse ?? false}
              onChange={(e) => onChange({ reverse: e.target.checked })}
            />
            <span className={labelCls}>{t.registry.box.reverse}</span>
          </label>
          <ZplCmd cmd="^FR" />
        </div>
      </SectionCard>
    );
  },
};
