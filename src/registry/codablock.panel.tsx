import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import { SectionCard, StaticSectionCard } from "../components/Properties/SectionCard";
import type { CodablockProps } from "./codablock";

export const codablockPanel: ObjectTypeUi<CodablockProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.codablock;
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection}>
          <input
            className={inputCls}
            aria-label={loc.content}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </StaticSectionCard>

        <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label={loc.rowHeight}
              value={p.rowHeight}
              min={1}
              onChange={(rowHeight) => onChange({ rowHeight })}
            />
            <NumberInput
              label={loc.moduleWidth}
              value={p.moduleWidth}
              min={1}
              max={10}
              onChange={(moduleWidth) => onChange({ moduleWidth })}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-accent"
              checked={p.securityLevel === "Y"}
              onChange={(e) =>
                onChange({ securityLevel: e.target.checked ? "Y" : "N" })
              }
            />
            <span className={labelCls}>{loc.security}</span>
          </label>

          <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} />
        </SectionCard>
      </>
    );
  },
};
