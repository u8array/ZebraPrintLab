import type { ObjectTypeCore } from "../types/ObjectType";
import { fieldPos, fdFieldFor } from "./zplHelpers";
import { commitStacked2DTransform } from "./transformHelpers";
import { type ZplRotation } from "./rotation";

export interface CodablockProps {
  content: string;
  moduleWidth: number; // bar width in dots
  rowHeight: number; // row height in dots
  securityLevel: "Y" | "N"; // security check
  rotation: ZplRotation;
}

export const codablock: ObjectTypeCore<CodablockProps> = {
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
};
