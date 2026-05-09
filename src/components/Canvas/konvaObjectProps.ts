import type { LabelObject } from "../../registry";
import type { ObjectChanges } from "../../store/labelStore";

/** Shared props for the per-type renderers under KonvaObject (LineObject,
 *  ImageObject, BarcodeObject, KonvaObjectInner). The dispatcher hands
 *  the wide LabelObject down; each renderer narrows internally. */
export interface KonvaObjectProps {
  obj: LabelObject;
  scale: number;
  dpmm: number;
  offsetX: number;
  offsetY: number;
  isSelected: boolean;
  onSelect: (addToSelection: boolean) => void;
  onChange: (changes: ObjectChanges) => void;
  snap: (dots: number) => number;
}
