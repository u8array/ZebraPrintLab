import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import type { Tlc39Props } from "./tlc39";

export const tlc39Panel: ObjectTypeUi<Tlc39Props> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.tlc39;
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
            label={loc.height}
            value={p.height}
            min={1}
            onChange={(height) => onChange({ height })}
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
            label={loc.microPdfRowHeight}
            value={p.microPdfRowHeight}
            min={1}
            max={255}
            onChange={(microPdfRowHeight) => onChange({ microPdfRowHeight })}
          />
          <NumberInput
            label={loc.microPdfRows}
            value={p.microPdfRows}
            min={1}
            max={99}
            onChange={(microPdfRows) => onChange({ microPdfRows })}
          />
        </div>

        <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} />
      </div>
    );
  },
};
