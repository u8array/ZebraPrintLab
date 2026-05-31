import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
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
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{loc.content}</label>
          <input
            className={inputCls}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </div>

        <NumberInput
          label={loc.magnification}
          value={p.magnification}
          min={MAGNIFICATION_MIN}
          max={MAGNIFICATION_MAX}
          onChange={(magnification) => onChange({ magnification })}
        />

        <NumberInput
          label={loc.ecLevel}
          value={p.ecLevel}
          min={EC_LEVEL_MIN}
          max={EC_LEVEL_MAX}
          onChange={(ecLevel) => onChange({ ecLevel })}
        />

        <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} />
      </div>
    );
  },
};
