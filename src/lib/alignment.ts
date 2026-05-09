/**
 * Group-bbox alignment math, decoupled from Konva and the store. Given a
 * collection of object footprints (rendered bboxes, expressed in any unit-
 * consistent space) plus a target label rect, returns the position deltas
 * required to centre the group bbox within the label.
 *
 * Multi-select uses the union of all bboxes and shifts every object by the
 * same delta — matches Figma's "align to canvas" behaviour for grouped
 * selections, where children keep their relative positions.
 */

export type AlignAxis = "h" | "v" | "both";

/** Object footprint in the caller's coordinate space (screen pixels or dots). */
export interface AlignBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlignTarget {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute (dx, dy) — the same shift applied to every member of the group so
 * that its combined bbox sits centred inside `target` along the requested
 * axis. Returns zero on the inactive axis. Empty input → {0,0}.
 */
export function computeGroupCenterDelta(
  boxes: readonly AlignBox[],
  target: AlignTarget,
  axis: AlignAxis,
): { dx: number; dy: number } {
  if (boxes.length === 0) return { dx: 0, dy: 0 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  const groupW = maxX - minX;
  const groupH = maxY - minY;

  const targetX = target.x + (target.width - groupW) / 2;
  const targetY = target.y + (target.height - groupH) / 2;

  return {
    dx: axis === "h" || axis === "both" ? targetX - minX : 0,
    dy: axis === "v" || axis === "both" ? targetY - minY : 0,
  };
}
