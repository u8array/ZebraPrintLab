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

/** Stacked-2D (PDF417/MicroPDF417/Codablock): height steps by rowHeight,
 *  width by moduleWidth. Both axes must snap in lock-step with the
 *  commit so the dropped bbox matches the post-render bitmap. */
export interface RowAnchor {
  kind: "row";
  nodeHeight: number;
  rowHeight: number;
  nodeWidth: number;
  moduleWidth: number;
}

/** 1D ^BY moduleWidth quantise anchor (unrotated only). */
export interface ModuleWidthAnchor {
  kind: "moduleWidth";
  nodeWidth: number;
  moduleWidth: number;
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

export function applyHeightSnap(
  oldBox: BoundingBox,
  newBox: BoundingBox,
  dotPx: number,
  anchor: TransformAnchor | null,
): BoundingBox {
  if (anchor?.kind !== "row" || anchor.rowHeight <= 0 || anchor.nodeHeight <= 0) {
    return newBox;
  }
  const stepPx = anchor.nodeHeight / anchor.rowHeight;
  const snappedH = snapBoxHeight(newBox.height, stepPx);
  return isTopAnchorResize(oldBox, newBox, dotPx * 0.5)
    ? pinBottomEdge(oldBox, newBox, snappedH)
    : { ...newBox, height: snappedH };
}

/** Shared by 1D and stacked-2D since both commit width via the same
 *  ^BY moduleWidth [1,10] rounding. */
export function applyModuleWidthSnap(
  oldBox: BoundingBox,
  newBox: BoundingBox,
  anchor: TransformAnchor | null,
): BoundingBox {
  if (anchor?.kind !== "moduleWidth" && anchor?.kind !== "row") return newBox;
  if (anchor.nodeWidth <= 0 || anchor.moduleWidth <= 0) return newBox;
  const scale = newBox.width / anchor.nodeWidth;
  const nextMw = computeNewModules(anchor.moduleWidth, scale, 1, 10);
  const snappedW = anchor.nodeWidth * (nextMw / anchor.moduleWidth);
  // Left-handle drag: pin the right edge so the snapped width grows
  // outward from the stationary anchor instead of drifting both sides.
  const leftMoved = Math.abs(newBox.x - oldBox.x) > 0.001;
  const x = leftMoved ? oldBox.x + oldBox.width - snappedW : oldBox.x;
  return { ...newBox, x, width: snappedW };
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
