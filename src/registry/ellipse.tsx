import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { NumberInput } from '../components/Properties/NumberInput';
import { fieldPos } from './zplHelpers';
import { commitWidthHeightTransform } from './transformHelpers';

export interface EllipseProps {
  width: number;
  height: number;
  thickness: number;
  filled: boolean;
  color: 'B' | 'W';
}

export const ellipse: ObjectTypeDefinition<EllipseProps> = {
  label: 'Ellipse',
  icon: '○',
  group: 'shape',
  defaultProps: {
    width: 150,
    height: 100,
    thickness: 3,
    filled: false,
    color: 'B',
  },
  defaultSize: { width: 150, height: 100 },
  nodeOrigin: 'center',

  commitTransform: commitWidthHeightTransform,

  toZPL: (obj) => {
    const p = obj.props;
    const thick = p.filled ? Math.min(p.width, p.height) : p.thickness;
    return [
      fieldPos(obj),
      `^GE${p.width},${p.height},${thick},${p.color}`,
      `^FS`,
    ].join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label={t.registry.ellipse.width}
            value={p.width}
            min={1}
            onChange={(width) => onChange({ width })}
          />
          <NumberInput
            label={t.registry.ellipse.height}
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
          <span className={labelCls}>{t.registry.ellipse.filled}</span>
        </label>

        {!p.filled && (
          <NumberInput
            label={t.registry.ellipse.thickness}
            value={p.thickness}
            min={1}
            onChange={(thickness) => onChange({ thickness })}
          />
        )}

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.ellipse.color}</label>
          <select
            className={inputCls}
            value={p.color}
            onChange={(e) => onChange({ color: e.target.value as EllipseProps['color'] })}
          >
            <option value="B">{t.registry.ellipse.colorB}</option>
            <option value="W">{t.registry.ellipse.colorW}</option>
          </select>
        </div>
      </div>
    );
  },
};
