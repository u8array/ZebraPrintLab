import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls } from '../components/Properties/styles';
import { filterContent } from './contentSpec';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import {
  GS1_DATABAR_DEFAULT_SEGMENTS,
  GS1_DATABAR_EXPANDED_SYMBOLOGIES,
} from '../lib/gs1';
import { SectionCard, StaticSectionCard } from '../components/Properties/SectionCard';
import { FieldLabel } from '../components/Properties/ZplCmd';
import { type Gs1DatabarProps, SYMBOLOGY_LABELS } from './gs1databar';

export const gs1databarPanel: ObjectTypeUi<Gs1DatabarProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.gs1databar;
    const isExpanded = GS1_DATABAR_EXPANDED_SYMBOLOGIES.has(p.symbology);
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection} cmd="^FD">
          <input
            className={inputCls}
            aria-label={loc.content}
            value={p.content}
            onChange={(e) => onChange({
              content: filterContent(e.target.value, {
                charset: isExpanded ? '0-9A-Za-z()' : '0-9',
              }),
            })}
          />
        </StaticSectionCard>

        <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
          <NumberInput
            label={loc.magnification}
            value={p.magnification}
            min={1}
            max={10}
            onChange={(magnification) => onChange({ magnification })}
            zplCmd="^BR"
          />

          <div className="flex flex-col gap-1">
            <FieldLabel cmd="^BR">{loc.symbology}</FieldLabel>
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
              <FieldLabel cmd="^BR">{loc.segments}</FieldLabel>
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
            zplCmd="^BR"
          />
        </SectionCard>
      </>
    );
  },
};
