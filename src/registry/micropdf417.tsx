import type { ObjectTypeDefinition } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { fieldPos } from "./zplHelpers";

export interface MicroPdf417Props {
  content: string;
  moduleWidth: number; // bar width in dots
  rowHeight: number; // row height in dots
}

export const micropdf417: ObjectTypeDefinition<MicroPdf417Props> = {
  label: "MicroPDF417",
  icon: "▤",
  group: "code",
  defaultProps: {
    content: "1234567890",
    moduleWidth: 2,
    rowHeight: 10,
  },
  defaultSize: { width: 200, height: 100 },

  toZPL: (obj) => {
    const p = obj.props;
    // ^BF{orientation},{rowHeight}
    return [
      p.moduleWidth !== 2 ? `^BY${p.moduleWidth}` : "",
      fieldPos(obj),
      `^BFN,${p.rowHeight}`,
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
      </div>
    );
  },
};
