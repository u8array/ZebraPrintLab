// Pure single-source-of-truth for an object's axis-aligned model-space
// bounding box in DOTS. Replaces scattered render-time Konva getClientRect
// usage so align/distribute can reason about geometry without a stage.
//
// Rotation note (verified, not guessed): the numeric `LabelObjectBase.rotation`
// is never read by any renderer (only a store default of 0). What actually
// drives rendered orientation is the per-type `props.rotation` ("N"|"R"|"I"|"B")
// for text/serial/symbol and every barcode. box/ellipse/image carry NO rotation
// at all and their renderers never rotate the node, so their bbox is the raw
// prop footprint. line orientation lives in `props.angle`; its bbox comes from
// the two endpoints.

import type { LabelObject } from "../types/Group";
import { getAllLeaves, isGroup } from "../types/Group";
import type { LeafObject } from "../registry";
import { BARCODE_1D_TYPES, STACKED_2D_TYPES, getEntry } from "../registry";
import type { LabelConfig } from "../types/LabelConfig";
import type { ZplRotation } from "../registry/rotation";
import { blockBoundsDots, zebraLineWidthDots } from "./zebraTextLayout";
import { resolveDefaultSizeDots } from "./resolveDefaultSize";
import { QR_FO_Y_OFFSET_DOTS, QR_FT_MODULE_OFFSET } from "./bwipConstants";

export interface BoundingBoxDots {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ObjectBoundsCtx {
  label: LabelConfig;
  /** Measured footprints (dots) published by the render layer for types whose
   *  size isn't purely computable (barcodes, single-line text). Keyed by obj.id.
   *  `barHeightDots` (barcodes) is the rotation-aware bar extent for FT anchoring. */
  measured?: ReadonlyMap<
    string,
    { width: number; height: number; barHeightDots?: number; barLeftDots?: number; barTopDots?: number }
  >;
}

/** Swap width/height for the quarter-turn rotations. Mirrors how every
 *  rotation-aware renderer derives its rotated footprint from the upright one. */
function rotatedFootprint(
  width: number,
  height: number,
  rotation: ZplRotation,
): { width: number; height: number } {
  return rotation === "R" || rotation === "B"
    ? { width: height, height: width }
    : { width, height };
}

/** Registry fallback footprint for a type when no measured size is published
 *  (object not yet rendered). Spec-fixed symbols carry mm; the rest carry dots. */
function fallbackSizeDots(
  obj: LeafObject,
  label: LabelConfig,
): { width: number; height: number } {
  const def = getEntry(obj.type)?.defaultSize;
  return def ? resolveDefaultSizeDots(def, label) : { width: 0, height: 0 };
}

/** Single-line text/serial footprint estimate from props when no measured
 *  size exists. Width is the Font-0 calibrated advance sum; height is the
 *  font height. Rotation swaps the axes. */
function singleLineEstimate(
  obj: LeafObject & { props: { content: string; fontHeight: number; fontWidth: number; rotation: ZplRotation } },
): { width: number; height: number } {
  const { content, fontHeight, fontWidth, rotation } = obj.props;
  const width = zebraLineWidthDots(content, fontHeight, fontWidth);
  return rotatedFootprint(width, fontHeight, rotation);
}

/** Visual bbox top-left for a barcode. Mirrors BarcodeObject's displayX/displayY
 *  and its ftYShiftDots: FT anchors at the bar bottom, so the top sits one
 *  rotation-aware bar extent (`barHeightDots`, published by the renderer) up;
 *  before the renderer publishes it, 1D falls back to props.height. QR adds a
 *  firmware Y artifact (FT: -3 modules on top of the bar extent, FO: +10 dots).
 *  The renderer also shifts the bbox top-left by `(-barLeftDots, -barTopDots)`
 *  when the HRI text zone extends left/above the bars; subtract the same here. */
function barcodeTopLeft(
  obj: LeafObject,
  fallbackHeight: number,
  measured: { barHeightDots?: number; barLeftDots?: number; barTopDots?: number } | undefined,
): { x: number; y: number } {
  const barLeft = measured?.barLeftDots ?? 0;
  const barTop = measured?.barTopDots ?? 0;
  if (obj.positionType === "FT") {
    let yShift =
      measured?.barHeightDots ??
      (BARCODE_1D_TYPES.has(obj.type)
        ? (obj.props as { height?: number }).height ?? fallbackHeight
        : 0);
    if (obj.type === "qrcode") {
      yShift += QR_FT_MODULE_OFFSET * (obj.props as { magnification: number }).magnification;
    }
    return { x: obj.x - barLeft, y: obj.y - yShift - barTop };
  }
  if (obj.type === "qrcode") return { x: obj.x - barLeft, y: obj.y + QR_FO_Y_OFFSET_DOTS - barTop };
  return { x: obj.x - barLeft, y: obj.y - barTop };
}

// All barcode types route through the measured cache. Composed from the registry
// sets so adding a symbology there can't silently leave it on the unknown fallback.
const BARCODE_TYPES = new Set<string>([
  ...BARCODE_1D_TYPES,
  ...STACKED_2D_TYPES,
  "tlc39",
  "qrcode",
  "datamatrix",
  "aztec",
  "maxicode",
]);
function isBarcode(obj: LeafObject): boolean {
  return BARCODE_TYPES.has(obj.type);
}

/** Axis-aligned model-space bbox (dots) for one object. Always the VISUAL
 *  top-left regardless of FO/FT, so align/distribute can use min/max edges. */
export function objectBoundsDots(obj: LabelObject, ctx: ObjectBoundsCtx): BoundingBoxDots {
  if (isGroup(obj)) return groupBounds(obj, ctx);

  switch (obj.type) {
    case "box":
    case "ellipse": {
      const p = obj.props;
      return { x: obj.x, y: obj.y, width: p.width, height: p.height };
    }
    case "image": {
      const p = obj.props;
      // Cached PNGs derive height from aspect at render, so consult the measured
      // cache first; fall back to heightDots, then a square from the width.
      const m = ctx.measured?.get(obj.id);
      return {
        x: obj.x,
        y: obj.y,
        width: m?.width ?? p.widthDots,
        height: m?.height ?? p.heightDots ?? p.widthDots,
      };
    }
    case "line":
      return lineBounds(obj);
    case "symbol": {
      // Zebra rotates only the glyph; the symbol bbox stays at (w, h).
      const p = obj.props;
      return { x: obj.x, y: obj.y, width: p.width, height: p.height };
    }
    case "text": {
      const p = obj.props;
      if (p.blockWidth && p.blockWidth > 0) {
        const b = blockBoundsDots({
          blockWidthDots: p.blockWidth,
          blockLines: p.blockLines ?? 1,
          blockLineSpacing: p.blockLineSpacing ?? 0,
          fontHeight: p.fontHeight,
          rotation: p.rotation,
        });
        // blockBoundsDots is field-anchor-relative (can be negative for R/I/B);
        // shift into absolute model space.
        return { x: obj.x + b.x, y: obj.y + b.y, width: b.width, height: b.height };
      }
      // Measured is the already-rotated footprint (the producer rotates it); the
      // fallback estimate computes upright and rotates itself.
      const fp = ctx.measured?.get(obj.id) ?? singleLineEstimate(obj);
      return { x: obj.x, y: obj.y, width: fp.width, height: fp.height };
    }
    case "serial": {
      const fp = ctx.measured?.get(obj.id) ?? singleLineEstimate(obj);
      return { x: obj.x, y: obj.y, width: fp.width, height: fp.height };
    }
    default: {
      if (isBarcode(obj)) {
        const m = ctx.measured?.get(obj.id);
        const fp = m ?? fallbackSizeDots(obj, ctx.label);
        const { x, y } = barcodeTopLeft(obj, fp.height, m);
        return { x, y, width: fp.width, height: fp.height };
      }
      // Unknown leaf: fall back to its registry footprint at the origin.
      const fp = fallbackSizeDots(obj, ctx.label);
      return { x: obj.x, y: obj.y, width: fp.width, height: fp.height };
    }
  }
}

/** Optical line bbox (the rendered band, not just the endpoints). Mirrors the
 *  LineObject render: x2 = x + len*cos, y2 = y + len*sin in dot space. */
function lineBounds(obj: LeafObject & { type: "line" }): BoundingBoxDots {
  const { angle, length, thickness } = obj.props;
  const rad = (angle * Math.PI) / 180;
  const x2 = obj.x + length * Math.cos(rad);
  const y2 = obj.y + length * Math.sin(rad);
  const dx = Math.abs(x2 - obj.x);
  const dy = Math.abs(y2 - obj.y);
  const minX = Math.min(obj.x, x2);
  const minY = Math.min(obj.y, y2);
  // Axis-aligned emits ^GB (plain band): thickness fills the thin axis.
  if (dx < 0.5 || dy < 0.5) {
    return { x: minX, y: minY, width: Math.max(dx, thickness), height: Math.max(dy, thickness) };
  }
  // Diagonal emits ^GD, which shears the band horizontally by thickness (see
  // diagonalPolygonPoints): the optical box is (w + t) wide, h tall.
  return { x: minX, y: minY, width: dx + thickness, height: dy };
}

/** Union of every leaf descendant. Group children are absolute-coordinated,
 *  so each leaf's own bbox already lands in model space. */
function groupBounds(obj: LabelObject, ctx: ObjectBoundsCtx): BoundingBoxDots {
  const leaves = isGroup(obj) ? getAllLeaves(obj.children) : [];
  const union = unionOf(leaves.map((l) => objectBoundsDots(l, ctx)));
  return union ?? { x: obj.x, y: obj.y, width: 0, height: 0 };
}

function unionOf(boxes: BoundingBoxDots[]): BoundingBoxDots | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Union bbox of a selection. A group id resolves to one bbox via its own
 *  objectBoundsDots. Returns null for an empty selection or no matches. */
export function selectionUnionDots(
  objects: LabelObject[],
  ids: readonly string[],
  ctx: ObjectBoundsCtx,
): BoundingBoxDots | null {
  const byId = new Map<string, LabelObject>();
  const index = (nodes: LabelObject[]) => {
    for (const n of nodes) {
      byId.set(n.id, n);
      if (isGroup(n)) index(n.children);
    }
  };
  index(objects);
  const boxes: BoundingBoxDots[] = [];
  for (const id of ids) {
    const node = byId.get(id);
    if (node) boxes.push(objectBoundsDots(node, ctx));
  }
  return unionOf(boxes);
}
