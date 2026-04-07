import type { ObjectTypeDefinition, LabelObject } from '../types/ObjectType';
import t from '../locales/en';
import { inputCls, labelCls } from '../components/Properties/styles';

export interface LineProps {
  direction: 'H' | 'V';
  length: number;
  thickness: number;
  color: 'B' | 'W';
}

export const line: ObjectTypeDefinition<LineProps> = {
  label: 'Line',
  icon: '—',
  group: 'shape',
  defaultProps: {
    direction: 'H',
    length: 200,
    thickness: 3,
    color: 'B',
  },
  defaultSize: { width: 200, height: 3 },

  toZPL: (obj: LabelObject): string => {
    const p = obj.props as LineProps;
    const w = p.direction === 'H' ? p.length : p.thickness;
    const h = p.direction === 'H' ? p.thickness : p.length;
    return [
      `^FO${obj.x},${obj.y}`,
      `^GB${w},${h},${p.thickness},${p.color},0`,
      `^FS`,
    ].join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const p = obj.props as LineProps;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.line.direction}</label>
          <select
            className={inputCls}
            value={p.direction}
            onChange={(e) => onChange({ direction: e.target.value as LineProps['direction'] })}
          >
            <option value="H">{t.registry.line.directionH}</option>
            <option value="V">{t.registry.line.directionV}</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.line.length}</label>
            <input
              type="number"
              className={inputCls}
              value={p.length}
              min={1}
              onChange={(e) => onChange({ length: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.line.thickness}</label>
            <input
              type="number"
              className={inputCls}
              value={p.thickness}
              min={1}
              onChange={(e) => onChange({ thickness: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.line.color}</label>
          <select
            className={inputCls}
            value={p.color}
            onChange={(e) => onChange({ color: e.target.value as LineProps['color'] })}
          >
            <option value="B">{t.registry.line.colorB}</option>
            <option value="W">{t.registry.line.colorW}</option>
          </select>
        </div>
      </div>
    );
  },
};
