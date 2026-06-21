import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls } from "../components/Properties/styles";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import { UnitNumberInput } from "../components/Properties/UnitNumberInput";
import { SectionCard, StaticSectionCard } from "../components/Properties/SectionCard";
import { fieldGridCols, fieldGridCell } from "../components/ui/formStyles";
import type { MicroPdf417Props } from "./micropdf417";

export const micropdf417Panel: ObjectTypeUi<MicroPdf417Props> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.micropdf417;
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
              zplCmd="^BF"
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

          <NumberInput
            label={loc.mode}
            value={p.mode}
            min={0}
            max={33}
            onChange={(mode) => onChange({ mode })}
            zplCmd="^BF"
          />

          <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} zplCmd="^BF" />
        </SectionCard>
      </>
    );
  },
};
