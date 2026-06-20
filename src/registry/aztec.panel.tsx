import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { useLabelStore } from "../store/labelStore";
import { inputCls } from "../components/Properties/styles";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import { SectionCard, StaticSectionCard } from "../components/Properties/SectionCard";
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
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection} cmd="^FD">
          {/* textarea, not input: typed content (vCard) carries real newlines. */}
          <textarea
            className={`${inputCls} resize-y min-h-9`}
            aria-label={loc.content}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
          <button
            type="button"
            onClick={() => openContentBuilder(obj.id)}
            className="self-start text-xs px-2 py-1 rounded border border-border bg-surface-2 hover:bg-border transition-colors"
          >
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
