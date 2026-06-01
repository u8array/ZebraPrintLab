import type { ObjectTypeCore } from "../types/ObjectType";
import { fieldPos, fdFieldFor } from "./zplHelpers";
import { commitBarcodeWidthHeightTransform } from "./transformHelpers";
import { type ZplRotation } from "./rotation";

export interface Tlc39Props {
  /** TLC39 data: `<ECI>,<serial>`. ECI is 6 digits; serial is up to
   *  25 alphanumeric characters (and renders as MicroPDF417 below the
   *  Code 39 line). The comma is the canonical separator per spec. */
  content: string;
  /** Code 39 narrow bar width in dots (1-10, default from ^BY). */
  moduleWidth: number;
  /** Code 39 height in dots (the dominant visible component). */
  height: number;
  /** MicroPDF417 row height in dots (1-255, default 4). */
  microPdfRowHeight: number;
  /** MicroPDF417 row count. Zebra ^BT h2 accepts 1-99; firmware snaps
   *  to a valid MicroPDF417 row count {4,6,8,10,12,15,20,26,32,38,44}.
   *  Default 4. */
  microPdfRows: number;
  rotation: ZplRotation;
}

export const tlc39: ObjectTypeCore<Tlc39Props> = {
  label: "TLC39",
  icon: "▦T",
  group: "code-2d",
  bindable: true,
  defaultProps: {
    content: "123456,SERIAL",
    moduleWidth: 2,
    height: 40,
    microPdfRowHeight: 4,
    microPdfRows: 4,
    rotation: "N",
  },
  defaultSize: { width: 200, height: 80 },

  commitTransform: commitBarcodeWidthHeightTransform,

  toZPL: (obj, ctx) => {
    const p = obj.props;
    return [
      `^BY${p.moduleWidth}`,
      fieldPos(obj),
      // r1=2 (wide:narrow ratio) is the Zebra default; the editor does
      // not expose it as a prop so we always emit the canonical value.
      `^BT${p.rotation},${p.moduleWidth},2,${p.height},${p.microPdfRowHeight},${p.microPdfRows}`,
      fdFieldFor(obj, p.content, ctx),
    ]
      .filter(Boolean)
      .join("");
  },
};
