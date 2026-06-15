// Pure align + distribute math in dots, decoupled from Konva/store. Operates on
// model-space bboxes (see objectBounds.ts) and returns per-object shift deltas
// the caller applies via updateObjects (one undo entry).

import type { BoundingBoxDots } from "./objectBounds";

export type AlignOp =
  | "left"
  | "hcenter"
  | "right"
  | "top"
  | "vmiddle"
  | "bottom";

export interface AlignBox extends BoundingBoxDots {
  id: string;
}

/** Which frame an align op snaps to. 'selection' = union bbox, 'label' = the
 *  label rect, 'key' = the last-selected object. Picked per-click by the
 *  toolbar (the "Align to label" buttons pass 'label'; the "Align" buttons
 *  pass the section toggle). */
export type AlignRef = 'selection' | 'label' | 'key';

export interface AlignDelta {
  id: string;
  dx: number;
  dy: number;
}

const right = (b: BoundingBoxDots): number => b.x + b.width;
const bottom = (b: BoundingBoxDots): number => b.y + b.height;
const centerX = (b: BoundingBoxDots): number => b.x + b.width / 2;
const centerY = (b: BoundingBoxDots): number => b.y + b.height / 2;

/** Per-object shift to align each box's chosen edge/center to `ref`. The caller
 *  picks `ref`: the selection union, the label rect, or a key-object bbox. */
export function computeAlignDeltas(
  boxes: readonly AlignBox[],
  ref: BoundingBoxDots,
  op: AlignOp,
): AlignDelta[] {
  return boxes.map((b) => {
    switch (op) {
      case "left":
        return { id: b.id, dx: ref.x - b.x, dy: 0 };
      case "right":
        return { id: b.id, dx: right(ref) - right(b), dy: 0 };
      case "hcenter":
        return { id: b.id, dx: centerX(ref) - centerX(b), dy: 0 };
      case "top":
        return { id: b.id, dx: 0, dy: ref.y - b.y };
      case "bottom":
        return { id: b.id, dx: 0, dy: bottom(ref) - bottom(b) };
      case "vmiddle":
        return { id: b.id, dx: 0, dy: centerY(ref) - centerY(b) };
    }
  });
}

export type DistributeAxis = "h" | "v";
export type DistributeMode =
  | { kind: "equalGap" }
  | { kind: "fixedGap"; gap: number };

/** Distribute along an axis. equalGap pins the two extreme boxes and equalizes
 *  the gaps between the rest (the size-aware spacing, not center-spacing, so
 *  mixed sizes look even). fixedGap lays the boxes out left-to-right from the
 *  first with a constant gap. Returns one delta per input box (id-keyed). */
export function computeDistribute(
  boxes: readonly AlignBox[],
  axis: DistributeAxis,
  mode: DistributeMode,
): AlignDelta[] {
  const lead = (b: AlignBox): number => (axis === "h" ? b.x : b.y);
  const size = (b: AlignBox): number => (axis === "h" ? b.width : b.height);
  const zero = (): AlignDelta[] => boxes.map((b) => ({ id: b.id, dx: 0, dy: 0 }));

  // equalGap needs >=3 (the two extremes are fixed); fixedGap needs >=2.
  if (boxes.length < (mode.kind === "equalGap" ? 3 : 2)) return zero();

  // Sort by leading edge; id tie-break keeps the layout deterministic.
  const sorted = [...boxes].sort((a, b) => lead(a) - lead(b) || a.id.localeCompare(b.id));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return zero();

  let gap: number;
  if (mode.kind === "fixedGap") {
    gap = mode.gap;
  } else {
    const span = lead(last) + size(last) - lead(first);
    const totalSize = sorted.reduce((sum, b) => sum + size(b), 0);
    gap = (span - totalSize) / (sorted.length - 1);
  }
  let cursor = lead(first); // pin the first box

  const targetLead = new Map<string, number>();
  for (const b of sorted) {
    targetLead.set(b.id, cursor);
    cursor += size(b) + gap;
  }

  return boxes.map((b) => {
    const delta = (targetLead.get(b.id) ?? lead(b)) - lead(b);
    return axis === "h"
      ? { id: b.id, dx: delta, dy: 0 }
      : { id: b.id, dx: 0, dy: delta };
  });
}

/** One-click tidy: read the selection as a row or column (by union aspect),
 *  then SPREAD it across the `container` (the safe area, else the label) with
 *  even spacing including equal margins to the container edges, and center each
 *  item on the cross axis. Maximizes use of the available space rather than
 *  equalizing within the current span. Caller picks which objects to tidy
 *  (e.g. excluding a frame/divider) and the container. */
export function computeTidy(
  boxes: readonly AlignBox[],
  container: BoundingBoxDots,
): AlignDelta[] {
  if (boxes.length < 2) return boxes.map((b) => ({ id: b.id, dx: 0, dy: 0 }));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  const horizontal = maxX - minX >= maxY - minY;

  const lead = (b: AlignBox): number => (horizontal ? b.x : b.y);
  const size = (b: AlignBox): number => (horizontal ? b.width : b.height);
  const crossLead = (b: AlignBox): number => (horizontal ? b.y : b.x);
  const crossSize = (b: AlignBox): number => (horizontal ? b.height : b.width);
  const cStart = horizontal ? container.x : container.y;
  const cExtent = horizontal ? container.width : container.height;
  const crossCenter =
    (horizontal ? container.y : container.x) +
    (horizontal ? container.height : container.width) / 2;

  const sorted = [...boxes].sort((a, b) => lead(a) - lead(b) || a.id.localeCompare(b.id));
  const sumSizes = sorted.reduce((s, b) => s + size(b), 0);
  // n+1 equal gaps: one before each item plus one after the last, so the margins
  // to the container edges match the inter-item spacing. Clamp at 0 on overflow.
  const gap = Math.max(0, (cExtent - sumSizes) / (sorted.length + 1));

  let cursor = cStart + gap;
  const targetLead = new Map<string, number>();
  for (const b of sorted) {
    targetLead.set(b.id, cursor);
    cursor += size(b) + gap;
  }

  return boxes.map((b) => {
    const along = (targetLead.get(b.id) ?? lead(b)) - lead(b);
    const cross = crossCenter - crossSize(b) / 2 - crossLead(b);
    return horizontal
      ? { id: b.id, dx: along, dy: cross }
      : { id: b.id, dx: cross, dy: along };
  });
}
