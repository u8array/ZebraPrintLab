import type { ObjectTypeCore } from "../types/ObjectType";
import { fieldPos, fdFieldFor } from "./zplHelpers";
import { commitStacked2DTransform } from "./transformHelpers";
import { type ZplRotation } from "./rotation";

export interface Pdf417Props {
  content: string;
  rowHeight: number;
  securityLevel: number; // 0–8
  columns: number; // 1–30, 0 = auto
  moduleWidth: number;
  rotation: ZplRotation;
}

export const pdf417: ObjectTypeCore<Pdf417Props> = {
  label: "PDF417",
  icon: "▥",
  zplCmd: "^B7",
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
};
