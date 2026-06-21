import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls } from "../components/Properties/styles";
import { filterContent } from "./contentSpec";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import { UnitNumberInput } from "../components/Properties/UnitNumberInput";
import { SectionCard, StaticSectionCard } from "../components/Properties/SectionCard";
import { FieldLabel } from "../components/Properties/ZplCmd";
import { Select } from "../components/ui/Select";
import { fieldGridCols, fieldGridCell } from "../components/ui/formStyles";
import { type SerialProps, serialSpec } from "./serial";

export const serialPanel: ObjectTypeUi<SerialProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    // The counter emits ^SF (pre-field) or ^SN (post-field) per zplMode.
    const serialCmd = p.zplMode === "SF" ? "^SF" : "^SN";
    return (
      <>
        <StaticSectionCard title={t.properties.contentSection}>
          <div className={`grid grid-cols-2 ${fieldGridCols}`}>
            <div className={fieldGridCell}>
              <FieldLabel cmd="^FD">{t.registry.serial.content}</FieldLabel>
              <input
                className={inputCls}
                value={p.content}
                onChange={(e) =>
                  onChange({ content: filterContent(e.target.value, serialSpec) })
                }
              />
            </div>
            <NumberInput
              label={t.registry.serial.increment}
              value={p.increment}
              min={1}
              onChange={(increment) => onChange({ increment })}
              zplCmd={serialCmd}
              className={fieldGridCell}
            />
          </div>
        </StaticSectionCard>

        <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
          <div className={`grid grid-cols-2 ${fieldGridCols}`}>
            <UnitNumberInput
              label={t.registry.serial.fontHeight}
              valueDots={p.fontHeight}
              minDots={1}
              onChangeDots={(fontHeight) => onChange({ fontHeight })}
              zplCmd="^A"
              className={fieldGridCell}
            />
            <UnitNumberInput
              label={t.registry.serial.fontWidth}
              valueDots={p.fontWidth}
              minDots={0}
              onChangeDots={(fontWidth) => onChange({ fontWidth })}
              zplCmd="^A"
              className={fieldGridCell}
            />
          </div>

          <RotationSelect
            value={p.rotation}
            onChange={(rotation) => onChange({ rotation })}
            zplCmd="^A"
          />

          <div className="flex flex-col gap-1">
            <FieldLabel cmd={serialCmd}>{t.registry.serial.zplMode}</FieldLabel>
            <Select<SerialProps["zplMode"]>
              value={p.zplMode}
              onChange={(zplMode) => onChange({ zplMode })}
              aria-label={t.registry.serial.zplMode}
              groups={[{ options: [
                { value: "SN", label: t.registry.serial.zplModeSN },
                { value: "SF", label: t.registry.serial.zplModeSF },
              ] }]}
            />
          </div>
        </SectionCard>
      </>
    );
  },
};
