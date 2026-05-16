export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** Snap a height to a multiple of stepPx, with stepPx as the minimum. */
export function snapBoxHeight(height: number, stepPx: number): number {
  return Math.max(stepPx, Math.round(height / stepPx) * stepPx);
}

/**
 * Forces newBox to be square while keeping the anchor corner pinned.
 *
 * Konva does not expose the active anchor to boundBoxFunc, so it is inferred
 * from which oldBox edges moved: an edge that did not move is the pinned
 * side. The new size is the larger of the two requested deltas, so either
 * axis the user pulls drives the resize.
 */
export function forceSquareBox(oldBox: BoundingBox, newBox: BoundingBox): BoundingBox {
  const leftMoved = Math.abs(newBox.x - oldBox.x) > 0.001;
  const topMoved = Math.abs(newBox.y - oldBox.y) > 0.001;
  const size = Math.max(Math.abs(newBox.width), Math.abs(newBox.height));
  const x = leftMoved ? oldBox.x + oldBox.width - size : oldBox.x;
  const y = topMoved ? oldBox.y + oldBox.height - size : oldBox.y;
  return { ...newBox, x, y, width: size, height: size };
}

/**
 * Adjust newBox so its bottom edge stays at oldBox's bottom (top-anchor resize)
 * with a height of snappedH. Used when the user drags the top handle.
 */
export function pinBottomEdge(
  oldBox: BoundingBox,
  newBox: BoundingBox,
  snappedH: number,
): BoundingBox {
  const bottom = oldBox.y + oldBox.height;
  return { ...newBox, y: bottom - snappedH, height: snappedH };
}

/** True if the resize originated from the top handle (y moved noticeably). */
export function isTopAnchorResize(
  oldBox: BoundingBox,
  newBox: BoundingBox,
  thresholdPx: number,
): boolean {
  return Math.abs(newBox.y - oldBox.y) > thresholdPx;
}

/**
 * Translate a transformed Konva node's coordinate into the model's top-left
 * stage-pixel coordinate. Konva's Ellipse positions by its center; everything
 * else by top-left. The visual size after a Transformer drag is `nodeSize * s`
 * (full width / height): the node's intrinsic size is unchanged at this point,
 * so only the scale captured before reset reflects the post-drag dimensions.
 */
export function transformNodeTopLeft(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  sx: number,
  sy: number,
  isCenterAnchored: boolean,
): { x: number; y: number } {
  const dx = isCenterAnchored ? (nodeWidth * sx) / 2 : 0;
  const dy = isCenterAnchored ? (nodeHeight * sy) / 2 : 0;
  return { x: nodeX - dx, y: nodeY - dy };
}

/**
 * Phase 1 of resize: row-quantise the height for stacked-2D barcodes
 * (PDF417, MicroPDF417, Codablock) where a non-integer row count is
 * invalid. Pins the bottom edge if the resize comes from the top anchor
 * so the dragged edge tracks the cursor.
 *
 * No-op for non-stacked-2D shapes — applying a height-snap there used to
 * trigger pinBottomEdge whenever Konva's frame-to-frame y drifted past a
 * sub-pixel threshold (low zoom = 1 dot < 1 screen pixel), compounding
 * into a runaway top-anchor pin that marched the box out of the work
 * area. Boxes / barcodes that don't need row-quantised heights run
 * unsnapped here; rounding happens in the global onTransformEnd snap.
 */
export interface RowAnchor {
  nodeHeight: number;
  rowHeight: number;
}

export function applyHeightSnap(
  oldBox: BoundingBox,
  newBox: BoundingBox,
  dotPx: number,
  anchor: RowAnchor | null,
): BoundingBox {
  if (!anchor || anchor.rowHeight <= 0 || anchor.nodeHeight <= 0) return newBox;
  const stepPx = anchor.nodeHeight / anchor.rowHeight;
  const snappedH = snapBoxHeight(newBox.height, stepPx);
  return isTopAnchorResize(oldBox, newBox, dotPx * 0.5)
    ? pinBottomEdge(oldBox, newBox, snappedH)
    : { ...newBox, height: snappedH };
}

/**
 * Tolerance for `positionDidMove`. Sized to absorb float rounding from the
 * screen-pixel <-> dot conversion; anything within this margin counts as
 * "did not move" so the original integer position is preserved.
 */
export const POSITION_MOVE_TOLERANCE_DOTS = 1;


export interface ActiveEdgeFlags {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

/**
 * Enforce the resize-invariant: edges the user did NOT grab stay at their
 * start-of-drag positions. Konva's per-frame scale-driven node-position
 * updates can drift sub-pixel for "stationary" edges even on a pure
 * single-edge drag — without this, those drifts compound and the box
 * walks away from where the user wanted it pinned.
 *
 *  - Both side-edges inactive → restore start.x and start.width.
 *  - Only one side-edge active → keep the moving edge's current position
 *    and extend the size from the corresponding pinned start-edge.
 *  - Both active (e.g. uniform-scale corner drag) → pass through.
 *
 * Same logic on the y axis.
 */
export function pinInactiveEdges(
  bbox: BoundingBox,
  startBox: BoundingBox,
  active: ActiveEdgeFlags,
): BoundingBox {
  let { x, y, width, height } = bbox;

  if (!active.left && !active.right) {
    x = startBox.x;
    width = startBox.width;
  } else if (!active.left) {
    // right edge moves; left is pinned at start
    const newRight = x + width;
    x = startBox.x;
    width = Math.max(0, newRight - x);
  } else if (!active.right) {
    // left edge moves; right is pinned at start
    const startRight = startBox.x + startBox.width;
    width = Math.max(0, startRight - x);
  }

  if (!active.top && !active.bottom) {
    y = startBox.y;
    height = startBox.height;
  } else if (!active.top) {
    // bottom edge moves; top is pinned at start
    const newBottom = y + height;
    y = startBox.y;
    height = Math.max(0, newBottom - y);
  } else if (!active.bottom) {
    // top edge moves; bottom is pinned at start
    const startBottom = startBox.y + startBox.height;
    height = Math.max(0, startBottom - y);
  }

  return { ...bbox, x, y, width, height };
}

/**
 * Decide whether the resize actually moved the object. When the user drags
 * a handle whose opposite anchor is the top-left, the position is visually
 * unchanged. Without this guard, applying snap to it would pull off-grid
 * shapes onto the grid as a side-effect of resizing.
 */
export function positionDidMove(
  rawDots: number,
  previousDots: number,
): boolean {
  return Math.abs(rawDots - previousDots) > POSITION_MOVE_TOLERANCE_DOTS;
}
