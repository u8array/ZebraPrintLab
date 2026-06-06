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

/** Anchor inferred from non-moving edge (Konva hides it from boundBoxFunc). */
export function forceSquareBox(oldBox: BoundingBox, newBox: BoundingBox): BoundingBox {
  const leftMoved = Math.abs(newBox.x - oldBox.x) > 0.001;
  const topMoved = Math.abs(newBox.y - oldBox.y) > 0.001;
  const size = Math.max(Math.abs(newBox.width), Math.abs(newBox.height));
  const x = leftMoved ? oldBox.x + oldBox.width - size : oldBox.x;
  const y = topMoved ? oldBox.y + oldBox.height - size : oldBox.y;
  return { ...newBox, x, y, width: size, height: size };
}

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

/** Row-quantise stacked-2D (PDF417/MicroPDF417/Codablock); skip otherwise
 *  to avoid low-zoom sub-pixel top-anchor runaway. */
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

/** Absorbs px<->dot float rounding so integer positions are preserved. */
export const POSITION_MOVE_TOLERANCE_DOTS = 1;


export interface ActiveEdgeFlags {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

/** Pin non-grabbed edges to start so Konva's sub-pixel drift can't walk them. */
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
    const newRight = x + width;
    x = startBox.x;
    width = Math.max(0, newRight - x);
  } else if (!active.right) {
    const startRight = startBox.x + startBox.width;
    width = Math.max(0, startRight - x);
  }

  if (!active.top && !active.bottom) {
    y = startBox.y;
    height = startBox.height;
  } else if (!active.top) {
    const newBottom = y + height;
    y = startBox.y;
    height = Math.max(0, newBottom - y);
  } else if (!active.bottom) {
    const startBottom = startBox.y + startBox.height;
    height = Math.max(0, startBottom - y);
  }

  return { ...bbox, x, y, width, height };
}

/** Guards snap-on-resize from pulling off-grid shapes to grid as a side-effect. */
export function positionDidMove(
  rawDots: number,
  previousDots: number,
): boolean {
  return Math.abs(rawDots - previousDots) > POSITION_MOVE_TOLERANCE_DOTS;
}
