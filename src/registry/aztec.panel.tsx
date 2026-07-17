import type { ObjectTypeUi } from "./panelTypes";
import { useT } from "../hooks/useT";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import { SectionCard } from "../components/Properties/SectionCard";
import { TypedContentSection } from "./typedContentSection";
import {
  type AztecProps,
  MAGNIFICATION_MIN,
  MAGNIFICATION_MAX,
  EC_LEVEL_MIN,
  EC_LEVEL_MAX,
} from "@zplab/core/registry/aztec";

export const aztecPanel: ObjectTypeUi<AztecProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.aztec;
    return (
      <>
        <TypedContentSection obj={obj} />

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
