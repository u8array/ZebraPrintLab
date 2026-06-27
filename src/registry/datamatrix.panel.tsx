import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { useLabelStore } from '../store/labelStore';
import { labelCls, builderButtonCls } from '../components/ui/formStyles';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import { SectionCard, StaticSectionCard } from '../components/Properties/SectionCard';
import { ContentEditorButton } from "../components/Properties/ContentEditorButton";
import { FieldLabel, ZplCmd } from '../components/Properties/ZplCmd';
import { Select } from '../components/ui/Select';
import { fieldHasVariable, asLabelObject } from '../lib/variableField';
import { GS1_SAMPLE_CONTENT, GS1_EXPANDED_CHARSET, elementStringToContent, parseGs1ToSegments } from '../lib/gs1';
import type { ContentSpec } from './contentSpec';
import { type DataMatrixProps, DIMENSION_MIN, DIMENSION_MAX } from './datamatrix';

// Stable spec so the sanitiser/regex WeakMap caches hit across keystrokes.
// `normalize` keeps the "(01)…(10)…" element-string paste shortcut.
const GS1_SPEC: ContentSpec = { charset: GS1_EXPANDED_CHARSET, normalize: elementStringToContent };

export const datamatrixPanel: ObjectTypeUi<DataMatrixProps> = {
  // GS1 mode restricts the editor to the GS1 charset (and enables the element-
  // string paste shortcut); plain ECC200 accepts a wide byte range, unfiltered.
  contentSpec: (props) => ((props as DataMatrixProps).gs1 ? GS1_SPEC : undefined),
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.datamatrix;
    const openContentBuilder = useLabelStore((s) => s.openContentBuilder);
    const openGs1Builder = useLabelStore((s) => s.openGs1Builder);
    const showZpl = useLabelStore((s) => s.showZplCommands);
    const variables = useLabelStore((s) => s.variables);
    // Builders write a literal string; disabled once the field carries a chip.
    const bound = fieldHasVariable(asLabelObject(obj), variables);
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection} cmd="^FD">
          <ContentEditorButton obj={obj} />
          {p.gs1 ? (
            <button type="button" disabled={bound} onClick={() => openGs1Builder(obj.id)} className={builderButtonCls}>
              {t.gs1builder.button}
            </button>
          ) : (
            <button type="button" disabled={bound} onClick={() => openContentBuilder(obj.id)} className={builderButtonCls}>
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
                          // A bound field's content comes from the variable; only
                          // seed a literal sample for an unbound, non-GS1 field.
                          ...(!bound && parseGs1ToSegments(p.content) === null
                            ? { content: GS1_SAMPLE_CONTENT }
                            : {}),
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
            <Select<DataMatrixProps['quality']>
              value={p.quality}
              disabled={p.gs1}
              onChange={(quality) => onChange({ quality })}
              aria-label={loc.quality}
              groups={[{ options: [
                { value: 0, label: loc.qualityAuto, badge: showZpl ? '0' : undefined },
                { value: 50, label: loc.quality50, badge: showZpl ? '50' : undefined },
                { value: 80, label: loc.quality80, badge: showZpl ? '80' : undefined },
                { value: 140, label: loc.quality140, badge: showZpl ? '140' : undefined },
                { value: 200, label: loc.quality200, badge: showZpl ? '200' : undefined },
              ] }]}
            />
          </div>

          <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} zplCmd="^BX" />
        </SectionCard>
      </>
    );
  },
};
