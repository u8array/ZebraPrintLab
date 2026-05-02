import type { ObjectTypeDefinition } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { fieldPos } from "./zplHelpers";
import { commitStacked2DTransform } from "./transformHelpers";

export interface Pdf417Props {
  content: string;
  rowHeight: number;
  securityLevel: number; // 0–8
  columns: number; // 1–30, 0 = auto
  moduleWidth: number;
}

export const pdf417: ObjectTypeDefinition<Pdf417Props> = {
  label: "PDF417",
  icon: "▥",
  group: "code-2d",
  defaultProps: {
    content: "1234567890",
    rowHeight: 2,
    securityLevel: 0,
    columns: 0,
    moduleWidth: 2,
  },
  defaultSize: { width: 300, height: 150 },

  commitTransform: commitStacked2DTransform,

  toZPL: (obj) => {
    const p = obj.props;
    return [
      `^BY${p.moduleWidth}`,
      fieldPos(obj),
      `^B7N,${p.rowHeight},${p.securityLevel},${p.columns},,,`,
      `^FD${p.content}^FS`,
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

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{loc.securityLevel}</label>
            <input
              type="number"
              className={inputCls}
              value={p.securityLevel}
              min={0}
              max={8}
              onChange={(e) =>
                onChange({ securityLevel: Number(e.target.value) })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{loc.columns}</label>
            <input
              type="number"
              className={inputCls}
              value={p.columns}
              min={0}
              max={30}
              onChange={(e) => onChange({ columns: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>
    );
  },
};
