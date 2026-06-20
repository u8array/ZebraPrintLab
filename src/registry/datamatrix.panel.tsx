import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { useLabelStore } from '../store/labelStore';
import { inputCls } from '../components/Properties/styles';
import { labelCls } from '../components/ui/formStyles';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import { SectionCard, StaticSectionCard } from '../components/Properties/SectionCard';
import { FieldLabel, ZplCmd } from '../components/Properties/ZplCmd';
import { filterContent } from './contentSpec';
import { GS1_EXPANDED_CHARSET, GS1_SAMPLE_CONTENT, elementStringToContent, parseGs1ToSegments } from '../lib/gs1';
import { type DataMatrixProps, DIMENSION_MIN, DIMENSION_MAX } from './datamatrix';

// Stable spec so filterContent's WeakMap cache hits across keystrokes.
const GS1_SPEC = { charset: GS1_EXPANDED_CHARSET };

export const datamatrixPanel: ObjectTypeUi<DataMatrixProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.datamatrix;
    const openContentBuilder = useLabelStore((s) => s.openContentBuilder);
    const openGs1Builder = useLabelStore((s) => s.openGs1Builder);
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection} cmd="^FD">
          {/* textarea, not input: typed content (vCard) carries real newlines. */}
          <textarea
            className={`${inputCls} resize-y min-h-9`}
            aria-label={loc.content}
            value={p.content}
            onChange={(e) => {
              const raw = e.target.value;
              // GS1 mode filters to the GS1 charset so parens never reach export.
              if (!p.gs1) { onChange({ content: raw }); return; }
              const pasted = elementStringToContent(raw);
              onChange({ content: pasted !== null ? pasted : filterContent(raw, GS1_SPEC) });
            }}
          />
          {p.gs1 ? (
            <button
              type="button"
              onClick={() => openGs1Builder(obj.id)}
              className="self-start text-xs px-2 py-1 rounded border border-border bg-surface-2 hover:bg-border transition-colors"
            >
              {t.gs1builder.button}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openContentBuilder(obj.id)}
              className="self-start text-xs px-2 py-1 rounded border border-border bg-surface-2 hover:bg-border transition-colors"
            >
              {t.contentBuilder.button}
            </button>
          )}
        </StaticSectionCard>

        <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-accent"
                checked={p.gs1}
                // GS1 requires ECC 200; seed a valid sample so the encoder never throws.
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? {
                          gs1: true,
                          quality: 200,
                          ...(parseGs1ToSegments(p.content) === null ? { content: GS1_SAMPLE_CONTENT } : {}),
                        }
                      : { gs1: false },
                  )
                }
              />
              <span className={labelCls}>{loc.gs1Mode}</span>
            </label>
            <ZplCmd cmd="^BX" />
          </div>

          <NumberInput
            label={loc.dimension}
            value={p.dimension}
            min={DIMENSION_MIN}
            max={DIMENSION_MAX}
            onChange={(dimension) => onChange({ dimension })}
            zplCmd="^BX"
          />

          <div className="flex flex-col gap-1">
            <FieldLabel cmd="^BX">{loc.quality}</FieldLabel>
            <select
              className={`${inputCls} disabled:opacity-50`}
              value={p.quality}
              disabled={p.gs1}
              onChange={(e) => onChange({ quality: Number(e.target.value) as DataMatrixProps['quality'] })}
            >
              <option value={0}>{loc.qualityAuto}</option>
              <option value={50}>{loc.quality50}</option>
              <option value={80}>{loc.quality80}</option>
              <option value={140}>{loc.quality140}</option>
              <option value={200}>{loc.quality200}</option>
            </select>
          </div>

          <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} zplCmd="^BX" />
        </SectionCard>
      </>
    );
  },
};
