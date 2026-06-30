export interface PaletteDragData {
  type: string;
  propsOverride?: object;
  /** Addable-entry id of the dragged item, for the drag-overlay chip to resolve
   *  its icon/label. Ignored by the canvas drop monitor (it reads type only). */
  entryId?: string;
}

/** Droppable id of the label canvas. Shared by the canvas droppable and the
 *  collision router so the literal never drifts. */
export const CANVAS_DROPPABLE_ID = 'canvas';

/** Draggable-id prefix for curated palette rows. The collision router, the
 *  sortable, and the reorder monitor must agree on it, so it lives here. */
export const ROW_PREFIX = 'palrow-';
export const rowDragId = (id: string) => `${ROW_PREFIX}${id}`;
export const isRowDragId = (id: string) => id.startsWith(ROW_PREFIX);
