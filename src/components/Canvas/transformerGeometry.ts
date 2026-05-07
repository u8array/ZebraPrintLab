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
 * Tolerance for `positionDidMove`. Sized to absorb float rounding from the
 * screen-pixel <-> dot conversion; anything within this margin counts as
 * "did not move" so the original integer position is preserved.
 */
export const POSITION_MOVE_TOLERANCE_DOTS = 1;

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
