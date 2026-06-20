import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { useLabelStore } from '../store/labelStore';
import { inputCls } from '../components/Properties/styles';
import { filterContent } from './contentSpec';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import {
  GS1_DATABAR_DEFAULT_SEGMENTS,
  GS1_DATABAR_EXPANDED_SYMBOLOGIES,
  GS1_EXPANDED_CHARSET,
  gtinBodyFromContent,
  elementStringToContent,
} from '../lib/gs1';
import { SectionCard, StaticSectionCard } from '../components/Properties/SectionCard';
import { FieldLabel } from '../components/Properties/ZplCmd';
import { type Gs1DatabarProps, SYMBOLOGY_LABELS } from './gs1databar';

// Stable specs so filterContent's WeakMap cache hits across keystrokes.
const EXPANDED_SPEC = { charset: GS1_EXPANDED_CHARSET };
const GTIN_SPEC = { charset: '0-9' };

export const gs1databarPanel: ObjectTypeUi<Gs1DatabarProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.gs1databar;
    const openGs1Builder = useLabelStore((s) => s.openGs1Builder);
    const isExpanded = GS1_DATABAR_EXPANDED_SYMBOLOGIES.has(p.symbology);
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection} cmd="^FD">
          <input
            className={inputCls}
            aria-label={isExpanded ? loc.content : loc.gtinLabel}
            value={p.content}
            onChange={(e) => {
              const raw = e.target.value;
              // Paste of an element string "(01)…(10)…" (whitespace tolerated):
              // store as raw content with GS separators so the filter doesn't
              // silently drop the parens and merge variable AIs.
              const pasted = isExpanded ? elementStringToContent(raw) : null;
              if (pasted !== null) { onChange({ content: pasted }); return; }
              onChange({ content: filterContent(raw, isExpanded ? EXPANDED_SPEC : GTIN_SPEC) });
            }}
          />
          {isExpanded ? (
            <button
              type="button"
              onClick={() => openGs1Builder(obj.id)}
              className="self-start text-xs px-2 py-1 rounded border border-border bg-surface-2 hover:bg-border transition-colors"
            >
              {t.gs1builder.button}
            </button>
          ) : (
            // Sym 1-5 carry only a GTIN; the multi-AI builder needs Expanded.
            <span className="text-[10px] text-muted">{loc.multiAiHint}</span>
          )}
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
              onChange={(e) => {
                const symbology = Number(e.target.value) as Gs1DatabarProps['symbology'];
                // Leaving Expanded: reduce multi-AI content to a bare GTIN so the
                // preview (derived GTIN) and the emitted ZPL stay in sync.
                const leavingExpanded = isExpanded && !GS1_DATABAR_EXPANDED_SYMBOLOGIES.has(symbology);
                onChange(leavingExpanded ? { symbology, content: gtinBodyFromContent(p.content) } : { symbology });
              }}
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
