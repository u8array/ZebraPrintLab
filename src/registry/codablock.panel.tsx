import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import { UnitNumberInput } from "../components/Properties/UnitNumberInput";
import { SectionCard, StaticSectionCard } from "../components/Properties/SectionCard";
import { ZplCmd } from "../components/Properties/ZplCmd";
import { fieldGridCols, fieldGridCell } from "../components/ui/formStyles";
import type { CodablockProps } from "./codablock";

export const codablockPanel: ObjectTypeUi<CodablockProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.codablock;
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection} cmd="^FD">
          <input
            className={inputCls}
            aria-label={loc.content}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </StaticSectionCard>

        <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
          <div className={`grid grid-cols-2 ${fieldGridCols}`}>
            <UnitNumberInput
              label={loc.rowHeight}
              valueDots={p.rowHeight}
              minDots={1}
              onChangeDots={(rowHeight) => onChange({ rowHeight })}
              zplCmd="^BB"
              className={fieldGridCell}
            />
            <NumberInput
              label={loc.moduleWidth}
              value={p.moduleWidth}
              min={1}
              max={10}
              onChange={(moduleWidth) => onChange({ moduleWidth })}
              zplCmd="^BY"
              className={fieldGridCell}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
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
            <ZplCmd cmd="^BB" />
          </div>

          <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} zplCmd="^BB" />
        </SectionCard>
      </>
    );
  },
};
