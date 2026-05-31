import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { filterContent } from "./contentSpec";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import { type SerialProps, serialSpec } from "./serial";

export const serialPanel: ObjectTypeUi<SerialProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.serial.content}</label>
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
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label={t.registry.serial.fontHeight}
            value={p.fontHeight}
            min={1}
            onChange={(fontHeight) => onChange({ fontHeight })}
          />
          <NumberInput
            label={t.registry.serial.fontWidth}
            value={p.fontWidth}
            min={0}
            onChange={(fontWidth) => onChange({ fontWidth })}
          />
        </div>

        <RotationSelect
          value={p.rotation}
          onChange={(rotation) => onChange({ rotation })}
        />

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.serial.zplMode}</label>
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
      </div>
    );
  },
};
