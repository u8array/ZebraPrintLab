import type { ObjectTypeDefinition } from '../types/ObjectType';
import t from '../locales/en';
import { inputCls, labelCls } from '../components/Properties/styles';

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

  toZPL: (obj) => {
    const p = obj.props;
    const thick = p.filled ? Math.min(p.width, p.height) : p.thickness;
    return [
      `^FO${obj.x},${obj.y}`,
      `^GE${p.width},${p.height},${thick},${p.color}`,
      `^FS`,
    ].join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.ellipse.width}</label>
            <input
              type="number"
              className={inputCls}
              value={p.width}
              min={1}
              onChange={(e) => onChange({ width: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.ellipse.height}</label>
            <input
              type="number"
              className={inputCls}
              value={p.height}
              min={1}
              onChange={(e) => onChange({ height: Number(e.target.value) })}
            />
          </div>
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
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.ellipse.thickness}</label>
            <input
              type="number"
              className={inputCls}
              value={p.thickness}
              min={1}
              onChange={(e) => onChange({ thickness: Number(e.target.value) })}
            />
          </div>
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
