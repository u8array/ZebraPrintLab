import type Konva from "konva";
import type { LabelObject } from "../../registry";
import type { ObjectChanges } from "../../store/labelStore";
import type { SnapGuide, SnapRect } from "../../lib/snapGuides";

/**
 * Click / tap handlers shared across every per-type renderer. Click reads
 * shift / ctrl / meta to toggle multi-select; tap (touch) is always a
 * single-select. Spread onto the outermost selectable Konva node:
 *
 *   <Group {...selectionHandlers(onSelect)}>
 */
export function selectionHandlers(onSelect: (add: boolean) => void): {
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap: () => void;
} {
  return {
    onClick: (e) =>
      onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey),
    onTap: () => onSelect(false),
  };
}

/** Shared props for the per-type renderers under KonvaObject (LineObject,
 *  ImageObject, BarcodeObject, KonvaObjectInner). LineObject and
 *  ImageObject re-narrow `obj` at the type level via `Omit & { obj: ... }`
 *  and the dispatcher passes the narrowed value explicitly; BarcodeObject
 *  and KonvaObjectInner currently take the wide LabelObject and narrow
 *  internally. */
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
  /** Snap-guide hooks used by line endpoint resize. Other shapes route
   *  through Konva's Transformer (useKonvaTransformer's boundBoxFunc)
   *  which has its own snap pipeline; lines manage their own endpoint
   *  drag and use these instead. Optional so per-type renderers without
   *  custom resize handles can ignore them. `getOthersSnapshot` takes
   *  the consumer's id so a single stable function can serve every
   *  renderer without per-object closure allocations. */
  getOthersSnapshot?: (excludeId: string) => SnapRect[];
  labelRect?: SnapRect;
  setGuides?: (guides: SnapGuide[]) => void;
}
