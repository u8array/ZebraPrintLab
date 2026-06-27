import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { useLabelStore } from "../store/labelStore";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import { SectionCard, StaticSectionCard } from "../components/Properties/SectionCard";
import { ContentEditorButton } from "../components/Properties/ContentEditorButton";
import { builderButtonCls } from "../components/ui/formStyles";
import { fieldHasVariable, asLabelObject } from "../lib/variableField";
import {
  type AztecProps,
  MAGNIFICATION_MIN,
  MAGNIFICATION_MAX,
  EC_LEVEL_MIN,
  EC_LEVEL_MAX,
} from "./aztec";

export const aztecPanel: ObjectTypeUi<AztecProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.aztec;
    const openContentBuilder = useLabelStore((s) => s.openContentBuilder);
    const variables = useLabelStore((s) => s.variables);
    // The typed-content builder writes a literal string; it can't coexist with
    // variable chips, so it's disabled once the field carries a variable.
    const bound = fieldHasVariable(asLabelObject(obj), variables);
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection} cmd="^FD">
          <ContentEditorButton obj={obj} />
          <button type="button" disabled={bound} onClick={() => openContentBuilder(obj.id)} className={builderButtonCls}>
            {t.contentBuilder.button}
          </button>
        </StaticSectionCard>

        <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
          <NumberInput
            label={loc.magnification}
            value={p.magnification}
            min={MAGNIFICATION_MIN}
            max={MAGNIFICATION_MAX}
            onChange={(magnification) => onChange({ magnification })}
            zplCmd="^B0"
          />

          <NumberInput
            label={loc.ecLevel}
            value={p.ecLevel}
            min={EC_LEVEL_MIN}
            max={EC_LEVEL_MAX}
            onChange={(ecLevel) => onChange({ ecLevel })}
            zplCmd="^B0"
          />

          <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} zplCmd="^B0" />
        </SectionCard>
      </>
    );
  },
};
