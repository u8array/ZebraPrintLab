import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { NumberInput } from '../components/Properties/NumberInput';
import { fieldPos } from './zplHelpers';

export interface CircleProps {
  diameter: number;
  thickness: number;
  filled: boolean;
  color: 'B' | 'W';
}

export const circle: ObjectTypeDefinition<CircleProps> = {
  label: 'Circle',
  icon: '●',
  group: 'shape',
  defaultProps: {
    diameter: 100,
    thickness: 3,
    filled: false,
    color: 'B',
  },
  defaultSize: { width: 100, height: 100 },
  nodeOrigin: 'center',
  uniformScale: true,

  // Force a uniform scale: take the smaller of the two axes so the resized
  // circle stays inside the bounding box the user dragged out.
  commitTransform: (obj, { sx, sy, snap }) => ({
    diameter: Math.max(1, snap(Math.round(obj.props.diameter * Math.min(sx, sy)))),
  }),

  toZPL: (obj) => {
    const p = obj.props;
    const thick = p.filled ? p.diameter : p.thickness;
    return [
      fieldPos(obj),
      `^GE${p.diameter},${p.diameter},${thick},${p.color}`,
      `^FS`,
    ].join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <NumberInput
          label={t.registry.circle.diameter}
          value={p.diameter}
          min={1}
          onChange={(diameter) => onChange({ diameter })}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={p.filled}
            onChange={(e) => onChange({ filled: e.target.checked })}
          />
          <span className={labelCls}>{t.registry.circle.filled}</span>
        </label>

        {!p.filled && (
          <NumberInput
            label={t.registry.circle.thickness}
            value={p.thickness}
            min={1}
            onChange={(thickness) => onChange({ thickness })}
          />
        )}

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.circle.color}</label>
          <select
            className={inputCls}
            value={p.color}
            onChange={(e) => onChange({ color: e.target.value as CircleProps['color'] })}
          >
            <option value="B">{t.registry.circle.colorB}</option>
            <option value="W">{t.registry.circle.colorW}</option>
          </select>
        </div>
      </div>
    );
  },
};
