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
import { isAxisSwapped, objectRotation, type ZplRotation } from "../registry/rotation";
import { blockBoundsDots, tbBoundsDots, zebraLineWidthDots } from "./zebraTextLayout";
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
   *  The FT anchor uses uprightBar*Dots; barHeightDots is the legacy fallback. */
  measured?: ReadonlyMap<
    string,
    {
      width: number;
      height: number;
      barHeightDots?: number;
      barLeftDots?: number;
      barTopDots?: number;
      /** Upright (unrotated) bar-rect size in dots, for the rotation-aware ^FT
       *  anchor. The ^FT origin (bar base, left edge) rotates with the field. */
      uprightBarWDots?: number;
      uprightBarHDots?: number;
    }
  >;
}

/** Swap width/height for the quarter-turn rotations. Mirrors how every
 *  rotation-aware renderer derives its rotated footprint from the upright one. */
function rotatedFootprint(
  width: number,
  height: number,
  rotation: ZplRotation,
): { width: number; height: number } {
  return isAxisSwapped(rotation)
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

/** Anchor to visual-top-left shift for one rotated line: the renderer rotates
 *  the node about obj.x/obj.y, so R/I/B move the AABB off the anchor. Takes the
 *  already-rotated footprint; mirrors blockBoundsDots. */
function rotatedLineOffset(
  rotation: ZplRotation,
  fpWidth: number,
  fpHeight: number,
): { x: number; y: number } {
  switch (rotation) {
    case "R": return { x: -fpWidth, y: 0 };
    case "I": return { x: -fpWidth, y: -fpHeight };
    case "B": return { x: 0, y: -fpHeight };
    case "N":
    default: return { x: 0, y: 0 };
  }
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

/** Visual-top-left offset of a ^FT barcode from its typeset anchor (bar base,
 *  left edge), per rotation, using the upright bar-rect size. The ^FT anchor
 *  rotates with the field, so R/I/B differ from N. Mirrors the verified ^FO
 *  render path; derived to match Labelary (verify there when touching). */
export function barcodeFtAnchorOffset(
  rotation: ZplRotation,
  uprightBarW: number,
  uprightBarH: number,
): { x: number; y: number } {
  switch (rotation) {
    case "R": return { x: 0, y: 0 };
    case "I": return { x: -uprightBarW, y: 0 };
    case "B": return { x: -uprightBarH, y: -uprightBarW };
    case "N":
    default: return { x: 0, y: -uprightBarH };
  }
}

/** Visual bbox top-left for a barcode: the ^FT typeset anchor shifted by the
 *  rotation-aware offset, or ^FO at the field origin (QR adds its firmware Y
 *  artifacts). barLeft/barTop mirror the render's HRI-zone shift. Uses the same
 *  barcodeFtAnchorOffset path as BarcodeObject so render and bounds agree even
 *  before the renderer publishes the upright dims (width 0 then, like render). */
function barcodeTopLeft(
  obj: LeafObject,
  fallbackHeight: number,
  fallbackWidth: number,
  measured:
    | {
        barHeightDots?: number;
        barLeftDots?: number;
        barTopDots?: number;
        uprightBarWDots?: number;
        uprightBarHDots?: number;
      }
    | undefined,
): { x: number; y: number } {
  const barLeft = measured?.barLeftDots ?? 0;
  const barTop = measured?.barTopDots ?? 0;
  if (obj.positionType === "FT") {
    const upH =
      measured?.uprightBarHDots ??
      measured?.barHeightDots ??
      (BARCODE_1D_TYPES.has(obj.type)
        ? (obj.props as { height?: number }).height ?? fallbackHeight
        : 0);
    // Pre-publish (no measured dims) the width-dependent I/B anchors fall back to
    // the same footprint width the bbox uses, so the returned box stays self-
    // consistent (else x is offset as if width 0 while width = the fallback).
    const off = barcodeFtAnchorOffset(
      objectRotation(obj.props),
      measured?.uprightBarWDots ?? fallbackWidth,
      upH,
    );
    const qrShift =
      obj.type === "qrcode"
        ? QR_FT_MODULE_OFFSET * (obj.props as { magnification: number }).magnification
        : 0;
    return { x: obj.x + off.x - barLeft, y: obj.y + off.y - qrShift - barTop };
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
export function isBarcode(obj: { type: string }): boolean {
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
        // ^TB extent is width x clip-height; ^FB stacks blockLines rows.
        const b =
          p.textMode === "tb"
            ? tbBoundsDots(p.blockWidth, p.blockHeight ?? p.fontHeight, p.rotation)
            : blockBoundsDots({
                blockWidthDots: p.blockWidth,
                blockLines: p.blockLines ?? 1,
                blockLineSpacing: p.blockLineSpacing ?? 0,
                fontHeight: p.fontHeight,
                rotation: p.rotation,
              });
        // bounds are field-anchor-relative (can be negative for R/I/B);
        // shift into absolute model space.
        return { x: obj.x + b.x, y: obj.y + b.y, width: b.width, height: b.height };
      }
      // Measured is the already-rotated footprint (the producer rotates it); the
      // fallback estimate computes upright and rotates itself.
      const fp = ctx.measured?.get(obj.id) ?? singleLineEstimate(obj);
      const off = rotatedLineOffset(p.rotation, fp.width, fp.height);
      return { x: obj.x + off.x, y: obj.y + off.y, width: fp.width, height: fp.height };
    }
    case "serial": {
      const fp = ctx.measured?.get(obj.id) ?? singleLineEstimate(obj);
      const off = rotatedLineOffset(obj.props.rotation, fp.width, fp.height);
      return { x: obj.x + off.x, y: obj.y + off.y, width: fp.width, height: fp.height };
    }
    default: {
      if (isBarcode(obj)) {
        const m = ctx.measured?.get(obj.id);
        const fp = m ?? fallbackSizeDots(obj, ctx.label);
        const { x, y } = barcodeTopLeft(obj, fp.height, fp.width, m);
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
