import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { NumberInput } from '../components/Properties/NumberInput';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { type SymbolProps, type SymbolCode, GS_SYMBOLS } from './symbol';

export const symbolPanel: ObjectTypeUi<SymbolProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.symbol.symbol}</label>
          <select
            className={inputCls}
            value={p.symbol}
            onChange={(e) => onChange({ symbol: e.target.value as SymbolCode })}
          >
            {GS_SYMBOLS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.glyph}  {t.registry.symbol[s.label as keyof typeof t.registry.symbol]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label={t.registry.symbol.height}
            value={p.height}
            min={1}
            onChange={(height) => onChange({ height })}
          />
          <NumberInput
            label={t.registry.symbol.width}
            value={p.width}
            min={1}
            onChange={(width) => onChange({ width })}
          />
        </div>
        <RotationSelect
          value={p.rotation}
          onChange={(rotation) => onChange({ rotation })}
        />
      </div>
    );
  },
};
