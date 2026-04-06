import type { ObjectTypeDefinition, LabelObject } from '../types/ObjectType';
import t from '../locales/en';
import { inputCls, labelCls } from '../components/Properties/styles';

export interface BoxProps {
  width: number;
  height: number;
  thickness: number;
  color: 'B' | 'W';
  rounding: number;
}

export const box: ObjectTypeDefinition<BoxProps> = {
  label: 'Box',
  icon: '□',
  defaultProps: {
    width: 200,
    height: 100,
    thickness: 3,
    color: 'B',
    rounding: 0,
  },
  defaultSize: { width: 200, height: 100 },

  toZPL: (obj: LabelObject): string => {
    const p = obj.props as BoxProps;
    return [
      `^FO${obj.x},${obj.y}`,
      `^GB${p.width},${p.height},${p.thickness},${p.color},${p.rounding}`,
    ].join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const p = obj.props as BoxProps;
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
