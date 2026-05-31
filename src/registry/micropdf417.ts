import type { ObjectTypeCore } from "../types/ObjectType";
import { fieldPos, fdFieldFor } from "./zplHelpers";
import { commitStacked2DTransform } from "./transformHelpers";
import { type ZplRotation } from "./rotation";

export interface MicroPdf417Props {
  content: string;
  moduleWidth: number; // bar width in dots
  rowHeight: number; // row height in dots
  mode: number;
  rotation: ZplRotation;
}

export const micropdf417: ObjectTypeCore<MicroPdf417Props> = {
  label: "MicroPDF417",
  icon: "▤",
  group: "code-2d",
  bindable: true,
  defaultProps: {
    content: "1234",
    moduleWidth: 2,
    rowHeight: 2,
    mode: 0,
    rotation: 'N',
  },
  defaultSize: { width: 200, height: 100 },

  commitTransform: commitStacked2DTransform,

  toZPL: (obj, ctx) => {
    const p = obj.props;
    // ^BF{orientation},{rowHeight},{mode}
    return [
      `^BY${p.moduleWidth}`,
      fieldPos(obj),
      `^BF${p.rotation},${p.rowHeight},${p.mode}`,
      fdFieldFor(obj, p.content, ctx),
    ]
      .filter(Boolean)
      .join("");
  },
};
