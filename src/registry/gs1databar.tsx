import type { ObjectTypeDefinition, LabelObjectBase } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { fieldPos, fdField } from './zplHelpers';
import { filterContent } from './contentSpec';
import { type ZplRotation } from './rotation';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import {
  GS1_DATABAR_DEFAULT_SEGMENTS,
  GS1_DATABAR_EXPANDED_SYMBOLOGIES,
} from '../lib/gs1';

export interface Gs1DatabarProps {
  content: string;
  moduleWidth: number;
  symbology: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  segments?: number;
  rotation: ZplRotation;
}

// ZPL ^BR height parameter. Zebra firmware overrides this with each variant's
// intrinsic bar height for sym 1–5; only Expanded Stacked (sym 7) uses it as
// per-row height. Hardcoded because heightLocked: true forbids resizing.
const ZPL_HEIGHT_PLACEHOLDER = 100;

// GS1 standard variant names. Kept in source rather than i18n because the spec
// defines them as proper nouns (matches the convention used for barcode-type
// labels like "GS1 Databar", "PDF417" in src/locales).
const SYMBOLOGY_LABELS: Record<Gs1DatabarProps['symbology'], string> = {
  1: 'Omnidirectional',
  2: 'Truncated',
  3: 'Stacked',
  4: 'Stacked Omni',
  5: 'Limited',
  6: 'Expanded',
  7: 'Expanded Stacked',
};

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
    // ^BRo,s,m,sep,h[,sg] — segments must only be present for Expanded Stacked (7).
    // Including segments on sym 1–6 makes Labelary stack the symbol (wrong rendering).
    const segs = p.symbology === 7 ? `,${p.segments ?? GS1_DATABAR_DEFAULT_SEGMENTS}` : '';
    return `^BY${p.moduleWidth}${fieldPos(obj)}^BR${p.rotation},${p.symbology},${p.moduleWidth},2,${ZPL_HEIGHT_PLACEHOLDER}${segs}${fdField(p.content)}`;
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.gs1databar;
    const isExpanded = GS1_DATABAR_EXPANDED_SYMBOLOGIES.has(p.symbology);
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

        <NumberInput
          label={loc.moduleWidth}
          value={p.moduleWidth}
          min={1}
          max={10}
          onChange={(moduleWidth) => onChange({ moduleWidth })}
        />

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{loc.symbology}</label>
          <select
            className={inputCls}
            value={p.symbology}
            onChange={(e) => onChange({ symbology: Number(e.target.value) as Gs1DatabarProps['symbology'] })}
          >
            {Object.entries(SYMBOLOGY_LABELS).map(([val, name]) => (
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
              value={p.segments ?? GS1_DATABAR_DEFAULT_SEGMENTS}
              min={2}
              max={22}
              step={2}
              onChange={(e) => {
                const v = Number(e.target.value);
                const even = v % 2 === 0 ? v : v + 1;
                onChange({ segments: Math.max(2, Math.min(22, even)) });
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
