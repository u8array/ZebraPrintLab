import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { useLabelStore } from '../store/labelStore';
import { labelCls } from '../components/Properties/styles';
import { NumberInput } from '../components/Properties/NumberInput';
import { UnitNumberInput } from '../components/Properties/UnitNumberInput';
import { SectionCard } from '../components/Properties/SectionCard';
import { FieldLabel, ZplCmd } from '../components/Properties/ZplCmd';
import { Select } from '../components/ui/Select';
import { fieldGridCols, fieldGridCell } from '../components/ui/formStyles';
import type { BoxProps } from './box';

export const boxPanel: ObjectTypeUi<BoxProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const showZpl = useLabelStore((s) => s.showZplCommands);
    return (
      <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
        <div className={`grid grid-cols-2 ${fieldGridCols}`}>
          <UnitNumberInput
            label={t.registry.box.width}
            valueDots={p.width}
            minDots={1}
            onChangeDots={(width) => onChange({ width })}
            zplCmd="^GB"
            className={fieldGridCell}
          />
          <UnitNumberInput
            label={t.registry.box.height}
            valueDots={p.height}
            minDots={1}
            onChangeDots={(height) => onChange({ height })}
            zplCmd="^GB"
            className={fieldGridCell}
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
          <UnitNumberInput
            label={t.registry.box.thickness}
            valueDots={p.thickness}
            minDots={1}
            onChangeDots={(thickness) => onChange({ thickness })}
            zplCmd="^GB"
          />
        )}

        <div className={`grid grid-cols-2 ${fieldGridCols}`}>
          <div className={fieldGridCell}>
            <FieldLabel cmd="^GB">{t.registry.box.color}</FieldLabel>
            <Select<BoxProps['color']>
              value={p.color}
              onChange={(color) => onChange({ color })}
              aria-label={t.registry.box.color}
              groups={[{ options: [
                { value: 'B', label: t.registry.box.colorB, badge: showZpl ? 'B' : undefined },
                { value: 'W', label: t.registry.box.colorW, badge: showZpl ? 'W' : undefined },
              ] }]}
            />
          </div>
          <NumberInput
            label={t.registry.box.rounding}
            value={p.rounding}
            min={0}
            max={8}
            onChange={(rounding) => onChange({ rounding })}
            zplCmd="^GB"
            className={fieldGridCell}
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
