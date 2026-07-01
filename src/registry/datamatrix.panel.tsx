import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { useLabelStore } from '../store/labelStore';
import { builderButtonCls } from '../components/ui/formStyles';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import { SectionCard, StaticSectionCard } from '../components/Properties/SectionCard';
import { ContentEditorButton } from "../components/Properties/ContentEditorButton";
import { FieldLabel } from '../components/Properties/ZplCmd';
import { Select } from '../components/ui/Select';
import { fieldHasVariable, asLabelObject } from '../lib/variableField';
import { GS1_CONTENT_SPEC, gs1EnablePatch } from './gs1FieldSpec';
import { Gs1BuilderButton, Gs1ModeToggle } from './gs1PanelControls';
import { type DataMatrixProps, DIMENSION_MIN, DIMENSION_MAX } from './datamatrix';

export const datamatrixPanel: ObjectTypeUi<DataMatrixProps> = {
  // GS1 mode restricts the editor to the GS1 charset (and enables the element-
  // string paste shortcut); plain ECC200 accepts a wide byte range, unfiltered.
  contentSpec: (props) => ((props as DataMatrixProps).gs1 ? GS1_CONTENT_SPEC : undefined),
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.datamatrix;
    const openContentBuilder = useLabelStore((s) => s.openContentBuilder);
    const showZpl = useLabelStore((s) => s.showZplCommands);
    const variables = useLabelStore((s) => s.variables);
    // Builders write a literal string; disabled once the field carries a chip.
    const bound = fieldHasVariable(asLabelObject(obj), variables);
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection} cmd="^FD">
          <ContentEditorButton obj={obj} />
          {p.gs1 ? (
            <Gs1BuilderButton objId={obj.id} bound={bound} />
          ) : (
            <button type="button" disabled={bound} onClick={() => openContentBuilder(obj.id)} className={builderButtonCls}>
              {t.contentBuilder.button}
            </button>
          )}
        </StaticSectionCard>

        <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
          <Gs1ModeToggle
            checked={p.gs1}
            // GS1 requires ECC 200, so force it on alongside the enable patch.
            onChange={(c) => onChange(c ? { ...gs1EnablePatch(p.content, bound), quality: 200 } : { gs1: false })}
            label={loc.gs1Mode}
            cmd="^BX"
          />

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
