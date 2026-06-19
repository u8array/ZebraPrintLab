import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls } from "../components/Properties/styles";
import { filterContent } from "./contentSpec";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import { SectionCard, StaticSectionCard } from "../components/Properties/SectionCard";
import { FieldLabel } from "../components/Properties/ZplCmd";
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
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
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
            />
          </div>
        </StaticSectionCard>

        <SectionCard id={`${obj.type}-settings`} title={t.properties.settingsSection}>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label={t.registry.serial.fontHeight}
              value={p.fontHeight}
              min={1}
              onChange={(fontHeight) => onChange({ fontHeight })}
              zplCmd="^A"
            />
            <NumberInput
              label={t.registry.serial.fontWidth}
              value={p.fontWidth}
              min={0}
              onChange={(fontWidth) => onChange({ fontWidth })}
              zplCmd="^A"
            />
          </div>

          <RotationSelect
            value={p.rotation}
            onChange={(rotation) => onChange({ rotation })}
            zplCmd="^A"
          />

          <div className="flex flex-col gap-1">
            <FieldLabel cmd={serialCmd}>{t.registry.serial.zplMode}</FieldLabel>
            <select
              className={inputCls}
              value={p.zplMode}
              onChange={(e) =>
                onChange({ zplMode: e.target.value as SerialProps["zplMode"] })
              }
            >
              <option value="SN">{t.registry.serial.zplModeSN}</option>
              <option value="SF">{t.registry.serial.zplModeSF}</option>
            </select>
          </div>
        </SectionCard>
      </>
    );
  },
};
