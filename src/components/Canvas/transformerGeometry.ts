import { isAxisSwapped, type ZplRotation } from "../../registry/rotation";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ActiveEdgeFlags {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

/** Snap a height to a multiple of stepPx, with stepPx as the minimum. */
export function snapBoxHeight(height: number, stepPx: number): number {
  return Math.max(stepPx, Math.round(height / stepPx) * stepPx);
}

/** Reject a resize only when it shrinks an axis below the floor. A box already
 *  thinner than the floor (e.g. converted from a thin line) stays growable and
 *  movable; only active shrinking past the floor is vetoed. */
export function shrinkingBelowFloor(
  oldBox: BoundingBox,
  newBox: BoundingBox,
  floor: number,
): boolean {
  return (
    (newBox.width < floor && newBox.width < oldBox.width) ||
    (newBox.height < floor && newBox.height < oldBox.height)
  );
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

/** Stacked-2D (PDF417/MicroPDF417/Codablock): height steps by rowHeight,
 *  width by moduleWidth. Both axes must snap in lock-step with the commit so
 *  the dropped bbox matches the post-render bitmap. R/B swap the screen axes;
 *  CODABLOCK A's ^BY min is 2, so the min is carried per anchor. */
export interface RowAnchor {
  kind: "row";
  nodeHeight: number;
  rowHeight: number;
  nodeWidth: number;
  moduleWidth: number;
  moduleWidthMin: number;
  rotation: ZplRotation;
}

/** 1D ^BY moduleWidth quantise anchor. The moduleWidth axis is the screen
 *  width for N/I and the screen height for R/B (the bars turn a quarter), so
 *  the snap needs both extents plus the rotation to pick the axis. */
export interface ModuleWidthAnchor {
  kind: "moduleWidth";
  nodeWidth: number;
  nodeHeight: number;
  moduleWidth: number;
  rotation: "N" | "R" | "I" | "B";
}

/** Uniform 2D (QR/Aztec/DataMatrix) anchor; `edges` from Konva's active
 *  anchor name so the pin survives rotated-view where bbox-diff doesn't. */
export interface UniformModuleAnchor {
  kind: "uniformModule";
  nodeSize: number;
  modules: number;
  min: number;
  max: number;
  edges: ActiveEdgeFlags;
}

export type TransformAnchor = RowAnchor | ModuleWidthAnchor | UniformModuleAnchor;

/** Single source of truth for module-step rounding shared by the
 *  in-drag snap and the on-release commit so they cannot diverge. */
export function computeNewModules(
  currentModules: number,
  scale: number,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(max, Math.round(currentModules * scale)));
}

/** Drag-handle move epsilon: below this an edge counts as stationary. */
const HANDLE_MOVE_EPS = 0.001;

/** Replace one screen axis's extent with `snapped`, pinning the non-grabbed
 *  edge so the stationary side holds while the snapped extent grows from it. */
function pinSnappedAxis(
  oldBox: BoundingBox,
  newBox: BoundingBox,
  axis: "x" | "y",
  snapped: number,
  eps: number,
): BoundingBox {
  if (axis === "y") {
    const topMoved = Math.abs(newBox.y - oldBox.y) > eps;
    const y = topMoved ? oldBox.y + oldBox.height - snapped : oldBox.y;
    return { ...newBox, y, height: snapped };
  }
  const leftMoved = Math.abs(newBox.x - oldBox.x) > eps;
  const x = leftMoved ? oldBox.x + oldBox.width - snapped : oldBox.x;
  return { ...newBox, x, width: snapped };
}

export function applyHeightSnap(
  oldBox: BoundingBox,
  newBox: BoundingBox,
  dotPx: number,
  anchor: TransformAnchor | null,
): BoundingBox {
  if (anchor?.kind !== "row" || anchor.rowHeight <= 0) return newBox;
  // rowHeight axis is the screen height for N/I, the screen width for R/B.
  const swapped = isAxisSwapped(anchor.rotation);
  const axisNode = swapped ? anchor.nodeWidth : anchor.nodeHeight;
  if (axisNode <= 0) return newBox;
  const stepPx = axisNode / anchor.rowHeight;
  const snapped = snapBoxHeight(swapped ? newBox.width : newBox.height, stepPx);
  return pinSnappedAxis(oldBox, newBox, swapped ? "x" : "y", snapped, dotPx * 0.5);
}

/** Snap one axis extent to the nearest integer ^BY moduleWidth multiple. */
function snapModuleExtent(
  extent: number,
  anchorExtent: number,
  moduleWidth: number,
  min: number,
): number {
  const nextMw = computeNewModules(moduleWidth, extent / anchorExtent, min, 10);
  return anchorExtent * (nextMw / moduleWidth);
}

/** Shared by 1D and stacked-2D since both commit width via the same ^BY
 *  moduleWidth [min,10] rounding. The moduleWidth axis is the screen width for
 *  N/I and the screen height for R/B (the bars turn a quarter). */
export function applyModuleWidthSnap(
  oldBox: BoundingBox,
  newBox: BoundingBox,
  anchor: TransformAnchor | null,
): BoundingBox {
  if (anchor?.kind !== "moduleWidth" && anchor?.kind !== "row") return newBox;
  if (anchor.moduleWidth <= 0) return newBox;
  const swapped = isAxisSwapped(anchor.rotation);
  const axisNode = swapped ? anchor.nodeHeight : anchor.nodeWidth;
  if (axisNode <= 0) return newBox;
  const min = anchor.kind === "row" ? anchor.moduleWidthMin : 1;
  const snapped = snapModuleExtent(
    swapped ? newBox.height : newBox.width,
    axisNode,
    anchor.moduleWidth,
    min,
  );
  return pinSnappedAxis(oldBox, newBox, swapped ? "y" : "x", snapped, HANDLE_MOVE_EPS);
}

/** Assumes forceSquareBox has run; pins the corner formed by anchor.edges. */
export function applyUniformModuleSnap(
  oldBox: BoundingBox,
  newBox: BoundingBox,
  anchor: TransformAnchor | null,
): BoundingBox {
  if (anchor?.kind !== "uniformModule" || !(anchor.nodeSize > 0) || !(anchor.modules > 0)) {
    return newBox;
  }
  const scale = newBox.width / anchor.nodeSize;
  const nextModules = computeNewModules(anchor.modules, scale, anchor.min, anchor.max);
  const snapped = anchor.nodeSize * (nextModules / anchor.modules);
  const x = anchor.edges.left ? oldBox.x + oldBox.width - snapped : oldBox.x;
  const y = anchor.edges.top ? oldBox.y + oldBox.height - snapped : oldBox.y;
  return { ...newBox, x, y, width: snapped, height: snapped };
}

/** Absorbs px<->dot float rounding so integer positions are preserved. */
export const POSITION_MOVE_TOLERANCE_DOTS = 1;

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

/** Returns null on unknown/rotater so callers can fall back to bbox-diff. */
export function activeEdgesFromAnchorName(name: string | null): ActiveEdgeFlags | null {
  if (!name) return null;
  const left = name.includes("left");
  const right = name.includes("right");
  const top = name.includes("top");
  const bottom = name.includes("bottom");
  if (!left && !right && !top && !bottom) return null;
  return { left, right, top, bottom };
}
