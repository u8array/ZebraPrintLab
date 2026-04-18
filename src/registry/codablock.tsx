import type { ObjectTypeDefinition } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { fieldPos } from "./zplHelpers";

export interface CodablockProps {
  content: string;
  moduleWidth: number; // bar width in dots
  rowHeight: number; // row height in dots
  securityLevel: "Y" | "N"; // security check
}

export const codablock: ObjectTypeDefinition<CodablockProps> = {
  label: "CODABLOCK",
  icon: "▥B",
  group: "code",
  defaultProps: {
    content: "1234567890",
    moduleWidth: 2,
    rowHeight: 10,
    securityLevel: "Y",
  },
  defaultSize: { width: 250, height: 120 },

  toZPL: (obj) => {
    const p = obj.props;
    // ^BB{orientation},{rowHeight},{security},{numCharsPerRow},{numRows},{mode}
    return [
      `^BY${p.moduleWidth}`,
      fieldPos(obj),
      `^BBN,${p.rowHeight},${p.securityLevel}`,
      `^FD${p.content}^FS`,
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
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{loc.rowHeight}</label>
            <input
              type="number"
              className={inputCls}
              value={p.rowHeight}
              min={1}
              onChange={(e) => onChange({ rowHeight: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{loc.moduleWidth}</label>
            <input
              type="number"
              className={inputCls}
              value={p.moduleWidth}
              min={1}
              max={10}
              onChange={(e) =>
                onChange({ moduleWidth: Number(e.target.value) })
              }
            />
          </div>
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
      </div>
    );
  },
};
