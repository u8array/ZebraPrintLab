import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { fieldPos } from './zplHelpers';

export interface DataMatrixProps {
  content: string;
  dimension: number;   // module size in dots (1–12)
  quality: 0 | 50 | 80 | 140 | 200;  // 0 = auto
}

export const datamatrix: ObjectTypeDefinition<DataMatrixProps> = {
  label: 'DataMatrix',
  icon: '▦',
  group: 'code-2d',
  defaultProps: {
    content: '1234567890',
    dimension: 5,
    quality: 200,
  },
  defaultSize: { width: 150, height: 150 },

  toZPL: (obj) => {
    const p = obj.props;
    return [
      fieldPos(obj),
      `^BXN,${p.dimension},${p.quality}`,
      `^FD${p.content}^FS`,
    ].join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.datamatrix.content}</label>
          <input
            className={inputCls}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.datamatrix.dimension}</label>
          <input
            type="number"
            className={inputCls}
            value={p.dimension}
            min={1}
            max={12}
            onChange={(e) => onChange({ dimension: Number(e.target.value) })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.datamatrix.quality}</label>
          <select
            className={inputCls}
            value={p.quality}
            onChange={(e) => onChange({ quality: Number(e.target.value) as DataMatrixProps['quality'] })}
          >
            <option value={0}>{t.registry.datamatrix.qualityAuto}</option>
            <option value={50}>{t.registry.datamatrix.quality50}</option>
            <option value={80}>{t.registry.datamatrix.quality80}</option>
            <option value={140}>{t.registry.datamatrix.quality140}</option>
            <option value={200}>{t.registry.datamatrix.quality200}</option>
          </select>
        </div>
      </div>
    );
  },
};
