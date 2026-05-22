import type { ObjectTypeDefinition } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { fieldPos, fdFieldFor } from "./zplHelpers";
import { commitStacked2DTransform } from "./transformHelpers";
import { type ZplRotation } from "./rotation";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";

export interface Pdf417Props {
  content: string;
  rowHeight: number;
  securityLevel: number; // 0–8
  columns: number; // 1–30, 0 = auto
  moduleWidth: number;
  rotation: ZplRotation;
}

export const pdf417: ObjectTypeDefinition<Pdf417Props> = {
  label: "PDF417",
  icon: "▥",
  group: "code-2d",
  bindable: true,
  defaultProps: {
    content: "1234567890",
    rowHeight: 2,
    securityLevel: 0,
    columns: 0,
    moduleWidth: 2,
    rotation: 'N',
  },
  defaultSize: { width: 300, height: 150 },

  commitTransform: commitStacked2DTransform,

  toZPL: (obj, ctx) => {
    const p = obj.props;
    return [
      `^BY${p.moduleWidth}`,
      fieldPos(obj),
      `^B7${p.rotation},${p.rowHeight},${p.securityLevel},${p.columns},,,`,
      fdFieldFor(obj, p.content, ctx),
    ]
      .filter(Boolean)
      .join("");
  },

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
