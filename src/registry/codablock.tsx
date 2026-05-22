import type { ObjectTypeDefinition } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { fieldPos, fdFieldFor } from "./zplHelpers";
import { commitStacked2DTransform } from "./transformHelpers";
import { type ZplRotation } from "./rotation";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";

export interface CodablockProps {
  content: string;
  moduleWidth: number; // bar width in dots
  rowHeight: number; // row height in dots
  securityLevel: "Y" | "N"; // security check
  rotation: ZplRotation;
}

export const codablock: ObjectTypeDefinition<CodablockProps> = {
  label: "CODABLOCK",
  icon: "▥B",
  group: "code-2d",
  bindable: true,
  defaultProps: {
    content: "1234567890",
    moduleWidth: 2,
    rowHeight: 2,
    securityLevel: "Y",
    rotation: 'N',
  },
  defaultSize: { width: 250, height: 120 },

  commitTransform: commitStacked2DTransform,

  toZPL: (obj, ctx) => {
    const p = obj.props;
    // ^BB{orientation},{rowHeight},{security},{numCharsPerRow},{numRows},{mode}
    return [
      `^BY${p.moduleWidth}`,
      fieldPos(obj),
      `^BB${p.rotation},${p.rowHeight},${p.securityLevel}`,
      fdFieldFor(obj, p.content, ctx),
    ]
      .filter(Boolean)
      .join("");
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.codablock;
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
      </div>
    );
  },
};
