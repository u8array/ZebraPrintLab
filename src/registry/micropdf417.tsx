import type { ObjectTypeDefinition } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { fieldPos } from "./zplHelpers";
import { commitStacked2DTransform } from "./transformHelpers";

export interface MicroPdf417Props {
  content: string;
  moduleWidth: number; // bar width in dots
  rowHeight: number; // row height in dots
  mode: number;
}

export const micropdf417: ObjectTypeDefinition<MicroPdf417Props> = {
  label: "MicroPDF417",
  icon: "▤",
  group: "code-2d",
  defaultProps: {
    content: "1234",
    moduleWidth: 2,
    rowHeight: 2,
    mode: 0,
  },
  defaultSize: { width: 200, height: 100 },

  commitTransform: commitStacked2DTransform,

  toZPL: (obj) => {
    const p = obj.props;
    // ^BF{orientation},{rowHeight},{mode}
    return [
      `^BY${p.moduleWidth}`,
      fieldPos(obj),
      `^BFN,${p.rowHeight},${p.mode}`,
      `^FD${p.content}^FS`,
    ]
      .filter(Boolean)
      .join("");
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const loc = t.registry.micropdf417;
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

        <div className="flex flex-col gap-1">
          <label className={labelCls}>Mode</label>
          <input
            type="number"
            className={inputCls}
            value={p.mode}
            min={0}
            max={33}
            onChange={(e) => onChange({ mode: Number(e.target.value) })}
          />
        </div>
      </div>
    );
  },
};
