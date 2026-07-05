import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/core";
import { CANVAS_DROPPABLE_ID, type PaletteDragData } from "../../dnd/types";
import { getEntry } from "../../registry";
import type { LeafObject } from "../../registry";

/** Id of the palette drop-preview object; renderers treat it like a pristine
 *  (never-deselected) object so no warning styling flashes mid-drag. */
export const PALETTE_GHOST_ID = "__ghost__";

export interface PaletteGhostDeps {
  /** Drag-liveness flag in a ref: the handlers are rebuilt per render for
   *  fresh closures, the flag must span the whole drag. */
  live: { current: boolean };
  locked: boolean;
  /** Last pointer position mapped into label dots (null while unmeasured). */
  pointerPos: () => { x: number; y: number } | null;
  setGhost: (ghost: LeafObject | null) => void;
  addObject: (type: string, position?: { x: number; y: number }, propsOverride?: object) => void;
}

/** The addable drag resolved at pointer, or null when the pointer is unmeasured
 *  or the drag carries no type. Shared so ghost preview and actual spawn agree
 *  on which drags are addable and where. */
function resolvePaletteDrag(
  event: DragMoveEvent | DragEndEvent,
  pointerPos: PaletteGhostDeps["pointerPos"],
) {
  const pos = pointerPos();
  if (!pos) return null;
  const dragData = event.active.data.current as PaletteDragData | undefined;
  if (!dragData?.type) return null;
  return { pos, type: dragData.type, propsOverride: dragData.propsOverride };
}

/** Ghost lifecycle for palette drags, extracted so the event ordering is
 *  regression-testable: dnd-kit dispatches onDragMove from a passive effect
 *  keyed on the drag translate, which the drag-end reducer resets, so a stale
 *  move can arrive after onDragEnd. The live flag drops those moves, else the
 *  ghost outlives the drag. */
export function paletteGhostHandlers({ live, locked, pointerPos, setGhost, addObject }: PaletteGhostDeps) {
  return {
    onDragStart() {
      live.current = true;
      setGhost(null);
    },
    onDragMove(event: DragMoveEvent) {
      if (!live.current || locked || event.over?.id !== CANVAS_DROPPABLE_ID) {
        setGhost(null);
        return;
      }
      const drag = resolvePaletteDrag(event, pointerPos);
      const def = drag && getEntry(drag.type);
      if (!drag || !def) return;
      setGhost({
        id: PALETTE_GHOST_ID,
        type: drag.type,
        ...drag.pos,
        rotation: 0,
        props: { ...def.defaultProps, ...drag.propsOverride },
      } as LeafObject);
    },
    onDragEnd(event: DragEndEvent) {
      live.current = false;
      setGhost(null);
      if (locked) return;
      if (event.over?.id !== CANVAS_DROPPABLE_ID) return;
      const drag = resolvePaletteDrag(event, pointerPos);
      if (!drag) return;
      addObject(drag.type, drag.pos, drag.propsOverride);
    },
    onDragCancel() {
      live.current = false;
      setGhost(null);
    },
  };
}
