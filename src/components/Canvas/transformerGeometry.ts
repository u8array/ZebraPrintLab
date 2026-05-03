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
 * dot coordinate. Konva's Ellipse positions by its center; everything else
 * by top-left. The visual radius after a Transformer drag is `nodeSize * s`:
 * the node's intrinsic size is unchanged at this point, so only the scale
 * captured before reset reflects the post-drag dimensions.
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
 * Decide whether the resize actually moved the object. When the user drags
 * a handle whose opposite anchor is the top-left, the position is visually
 * unchanged. Without this guard, applying snap to it would pull off-grid
 * shapes onto the grid as a side-effect of resizing. Tolerance is one dot
 * to absorb float rounding from the screen-pixel <-> dot conversion.
 */
export function transformPositionMoved(
  rawDots: number,
  previousDots: number,
): boolean {
  return Math.abs(rawDots - previousDots) > 1;
}
