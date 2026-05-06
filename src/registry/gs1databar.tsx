import type { ObjectTypeDefinition, LabelObjectBase } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { fieldPos, fdField } from './zplHelpers';
import { filterContent } from './contentSpec';
import { type ZplRotation } from './rotation';
import { RotationSelect } from '../components/Properties/RotationSelect';

export interface Gs1DatabarProps {
  content: string;
  moduleWidth: number;
  symbology: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  segments?: number;
  rotation: ZplRotation;
}

const SYMBOLOGY_LABELS: Record<Gs1DatabarProps['symbology'], string> = {
  1: 'Omnidirectional',
  2: 'Truncated',
  3: 'Stacked',
  4: 'Stacked Omni',
  5: 'Limited',
  6: 'Expanded',
  7: 'Expanded Stacked',
};

// Expanded variants accept free-form AI content; others expect digits only.
const EXPANDED_SYMBOLOGIES = new Set<number>([6, 7]);

export const gs1databar: ObjectTypeDefinition<Gs1DatabarProps> = {
  label: 'GS1 Databar',
  icon: 'GS1',
  group: 'code-1d',
  defaultProps: {
    content: '0112345678901',
    moduleWidth: 2,
    symbology: 1,
    rotation: 'N',
  },
  defaultSize: { width: 300, height: 120 },
  heightLocked: true,

  toZPL: (obj: LabelObjectBase & { props: Gs1DatabarProps }) => {
    const p = obj.props;
    // Segments must be even (2–22); only used by Expanded Stacked (7).
    // Other symbologies require the field in the command but firmware ignores it.
    const segs = p.symbology === 7 ? (p.segments ?? 22) : 2;
    // ^BRo,s,m,sep,h,sg — height hardcoded 100 (firmware overrides for most variants)
    return `^BY${p.moduleWidth}${fieldPos(obj)}^BR${p.rotation},${p.symbology},${p.moduleWidth},2,100,${segs}${fdField(p.content)}`;
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.gs1databar;
    const isExpanded = EXPANDED_SYMBOLOGIES.has(p.symbology);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{loc.content}</label>
          <input
            className={inputCls}
            value={p.content}
            onChange={(e) => onChange({
              content: filterContent(e.target.value, {
                charset: isExpanded ? '0-9A-Za-z()' : '0-9',
              }),
            })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{loc.moduleWidth}</label>
          <input
            type="number"
            className={inputCls}
            value={p.moduleWidth}
            min={1}
            max={10}
            onChange={(e) => onChange({ moduleWidth: Number(e.target.value) })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{loc.symbology}</label>
          <select
            className={inputCls}
            value={p.symbology}
            onChange={(e) => onChange({ symbology: Number(e.target.value) as Gs1DatabarProps['symbology'] })}
          >
            {(Object.entries(SYMBOLOGY_LABELS) as [string, string][]).map(([val, name]) => (
              <option key={val} value={val}>{name}</option>
            ))}
          </select>
        </div>

        {p.symbology === 7 && (
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{loc.segments}</label>
            <input
              type="number"
              className={inputCls}
              value={p.segments ?? 22}
              min={2}
              max={22}
              step={2}
              onChange={(e) => {
                const v = Number(e.target.value);
                onChange({ segments: v % 2 === 0 ? v : v + 1 });
              }}
            />
          </div>
        )}

        <RotationSelect
          value={p.rotation}
          onChange={(rotation) => onChange({ rotation })}
        />
      </div>
    );
  },
};
