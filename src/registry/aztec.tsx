import type { ObjectTypeDefinition } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { fieldPos } from "./zplHelpers";

export interface AztecProps {
  content: string;
  magnification: number; // 1–10, module size in dots
  ecLevel: number; // 0 = auto, 1–99 error correction percentage, 201–232 for layers
}

export const aztec: ObjectTypeDefinition<AztecProps> = {
  label: "Aztec",
  icon: "◇",
  group: "code",
  defaultProps: {
    content: "1234567890",
    magnification: 4,
    ecLevel: 0,
  },
  defaultSize: { width: 200, height: 200 },

  toZPL: (obj) => {
    const p = obj.props;
    // ^B0{orientation},{magnification},{ecic},{menuSymbol},{numberOfSymbols},{structuredID}
    // Also ^BO (alternate) — we use ^B0 as canonical
    return [
      fieldPos(obj),
      `^B0N,${p.magnification},N,N,N,N`,
      `^FD${p.content}^FS`,
    ].join("");
  },

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

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{loc.magnification}</label>
          <input
            type="number"
            className={inputCls}
            value={p.magnification}
            min={1}
            max={10}
            onChange={(e) =>
              onChange({ magnification: Number(e.target.value) })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{loc.ecLevel}</label>
          <input
            type="number"
            className={inputCls}
            value={p.ecLevel}
            min={0}
            max={232}
            onChange={(e) => onChange({ ecLevel: Number(e.target.value) })}
          />
        </div>
      </div>
    );
  },
};
