import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import type { Pdf417Props } from "./pdf417";

export const pdf417Panel: ObjectTypeUi<Pdf417Props> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.pdf417;
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

        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label={loc.securityLevel}
            value={p.securityLevel}
            min={0}
            max={8}
            onChange={(securityLevel) => onChange({ securityLevel })}
          />
          <NumberInput
            label={loc.columns}
            value={p.columns}
            min={0}
            max={30}
            onChange={(columns) => onChange({ columns })}
          />
        </div>

        <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} />
      </div>
    );
  },
};
