import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';

export interface BoxProps {
  width: number;
  height: number;
  thickness: number;
  filled: boolean;
  color: 'B' | 'W';
  rounding: number;
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

  toZPL: (obj) => {
    const p = obj.props;
    const t = p.filled ? Math.min(p.width, p.height) : p.thickness;
    return [
      `^FO${obj.x},${obj.y}`,
      `^GB${p.width},${p.height},${t},${p.color},${p.rounding}`,
      `^FS`,
    ].join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.box.width}</label>
            <input
              type="number"
              className={inputCls}
              value={p.width}
              min={1}
              onChange={(e) => onChange({ width: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.box.height}</label>
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
          <span className={labelCls}>{t.registry.box.filled}</span>
        </label>

        {!p.filled && (
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.box.thickness}</label>
            <input
              type="number"
              className={inputCls}
              value={p.thickness}
              min={1}
              onChange={(e) => onChange({ thickness: Number(e.target.value) })}
            />
          </div>
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
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.box.rounding}</label>
            <input
              type="number"
              className={inputCls}
              value={p.rounding}
              min={0}
              max={8}
              onChange={(e) => onChange({ rounding: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>
    );
  },
};
