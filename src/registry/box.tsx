import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { fieldPos } from './zplHelpers';
import { commitWidthHeightTransform } from './transformHelpers';
import { NumberInput } from '../components/Properties/NumberInput';

export interface BoxProps {
  width: number;
  height: number;
  thickness: number;
  filled: boolean;
  color: 'B' | 'W';
  rounding: number;
  reverse?: boolean;
}

export const box: ObjectTypeDefinition<BoxProps> = {
  label: 'Box',
  icon: '□',
  group: 'shape',
  defaultProps: {
    width: 200,
    height: 100,
    thickness: 3,
    filled: false,
    color: 'B',
    rounding: 0,
  },
  defaultSize: { width: 200, height: 100 },

  commitTransform: commitWidthHeightTransform,

  toZPL: (obj) => {
    const p = obj.props;
    const t = p.filled ? Math.min(p.width, p.height) : p.thickness;
    return [
      p.reverse ? '^LRY' : '',
      fieldPos(obj),
      `^GB${p.width},${p.height},${t},${p.color},${p.rounding}`,
      '^FS',
      p.reverse ? '^LRN' : '',
    ].filter(Boolean).join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label={t.registry.box.width}
            value={p.width}
            min={1}
            onChange={(width) => onChange({ width })}
          />
          <NumberInput
            label={t.registry.box.height}
            value={p.height}
            min={1}
            onChange={(height) => onChange({ height })}
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={p.filled}
            onChange={(e) => onChange({ filled: e.target.checked })}
          />
          <span className={labelCls}>{t.registry.box.filled}</span>
        </label>

        {!p.filled && (
          <NumberInput
            label={t.registry.box.thickness}
            value={p.thickness}
            min={1}
            onChange={(thickness) => onChange({ thickness })}
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.box.color}</label>
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
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={p.reverse ?? false}
            onChange={(e) => onChange({ reverse: e.target.checked })}
          />
          <span className={labelCls}>{t.registry.box.reverse}</span>
        </label>
      </div>
    );
  },
};
