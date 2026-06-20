import type Konva from "konva";
import type { LeafObject } from "../../registry";
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
 *  ImageObject, BarcodeObject, KonvaObjectInner). Per-type renderers
 *  always receive a leaf; groups have no Konva counterpart and the
 *  dispatcher in LabelCanvas filters them out before mapping. Typed as
 *  LeafObject here so the renderers can reach .props without narrowing. */
export interface KonvaObjectProps {
  obj: LeafObject;
  scale: number;
  dpmm: number;
  offsetX: number;
  offsetY: number;
  isSelected: boolean;
  onSelect: (addToSelection: boolean) => void;
  onChange: (changes: ObjectChanges) => void;
  snap: (dots: number) => number;
  /** Whole-object drag handlers from useKonvaDragController; renderers spread
   *  these onto their draggable node. Drag-start is captured on the Stage. */
  dragHandlers?: {
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void;
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  };
  /** Register a custom live-mover so state-driven renderers (lines) follow the
   *  centralized drag instead of relying on node position. */
  registerMover?: (id: string, mover: ((localDx: number, localDy: number) => void) | null) => void;
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
