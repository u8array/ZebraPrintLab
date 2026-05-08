import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { fieldPos, fdField } from './zplHelpers';
import { commitUniformScaleTransform } from './transformHelpers';
import { type ZplRotation } from './rotation';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';

const DIMENSION_MIN = 1;
const DIMENSION_MAX = 12;

export interface DataMatrixProps {
  content: string;
  dimension: number;   // module size in dots
  quality: 0 | 50 | 80 | 140 | 200;  // 0 = auto
  rotation: ZplRotation;
}

export const datamatrix: ObjectTypeDefinition<DataMatrixProps> = {
  label: 'DataMatrix',
  icon: '▦',
  group: 'code-2d',
  defaultProps: {
    content: '1234567890',
    dimension: 5,
    quality: 200,
    rotation: 'N',
  },
  defaultSize: { width: 150, height: 150 },

  commitTransform: commitUniformScaleTransform('dimension', DIMENSION_MIN, DIMENSION_MAX),

  toZPL: (obj) => {
    const p = obj.props;
    return [
      fieldPos(obj),
      `^BX${p.rotation},${p.dimension},${p.quality}`,
      fdField(p.content),
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

        <NumberInput
          label={t.registry.datamatrix.dimension}
          value={p.dimension}
          min={DIMENSION_MIN}
          max={DIMENSION_MAX}
          onChange={(dimension) => onChange({ dimension })}
        />

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

        <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} />
      </div>
    );
  },
};
