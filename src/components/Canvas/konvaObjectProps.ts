import type Konva from "konva";
import type { RefObject } from "react";
import type { LeafObject } from "../../registry";
import { useLabelStore, type ObjectChanges } from "../../store/labelStore";
import type { SnapGuide, SnapRect } from "../../lib/snapGuides";
import { PALETTE_GHOST_ID } from "./paletteGhostMonitor";

/** Konva `name` on editor-only chrome (grid, safe-area, overset ghost, …) so
 *  image capture can hide it. Shared by LabelCanvas and the renderers. */
export const CAPTURE_CHROME = "capture-chrome";

/** Dotted outline shared by every unconfigured-field placeholder (empty-text
 *  rect, blank-barcode frame) so "not configured yet" reads as one style. */
export const PLACEHOLDER_STROKE_PX = 3;
export const PLACEHOLDER_DASH: [number, number] = [0.1, 8];

/** Whether a blank field should show its warning styling (orange frame /
 *  placeholder): true once the untouched-field grace has ended, false while
 *  the object is still pristine or is the palette drop ghost. One store read +
 *  predicate shared by every renderer so the barcode frame and the text
 *  placeholder can't disagree. */
export function useBlankFieldWarns(objectId: string): boolean {
  const pristine = useLabelStore((s) => s.pristineEmptyIds.includes(objectId));
  return !pristine && objectId !== PALETTE_GHOST_ID;
}

/** Minimum grab width for stroke-only hit areas (shared with LineObject). */
export const MIN_HIT_STROKE_PX = 14;

/** An unselected frame hits only on its stroke so the enclosed area stays
 *  click-through; thin strokes widen to MIN_HIT_STROKE_PX. Selected, the
 *  full area hits so the frame drags from its middle. */
export function shapeHitProps(
  renderFilled: boolean,
  strokeWidthPx: number,
  isSelected: boolean,
): { fillEnabled: boolean; hitStrokeWidth?: number } {
  if (renderFilled) return { fillEnabled: true };
  return {
    fillEnabled: isSelected,
    hitStrokeWidth: Math.max(strokeWidthPx, MIN_HIT_STROKE_PX),
  };
}

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
    // Right-click leaves the selection untouched so a multi-select / group
    // survives; the context-menu handler selects an unselected target itself.
    onClick: (e) => {
      if (e.evt.button === 2) return;
      onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey);
    },
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
  /** Shared Ctrl/Cmd smart-snap bypass (useSnapBypassRef), same source the
   *  drag controller and Transformer read so the gesture works everywhere. */
  snapBypassRef?: RefObject<boolean>;
}
