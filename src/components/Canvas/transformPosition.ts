import { BARCODE_1D_TYPES } from "../../registry";
import type { LeafObject } from "../../registry";
import { QR_FO_Y_OFFSET_DOTS } from "./bwipConstants";

/**
 * Convert the rendered top-left of a Konva node back to the object's stored
 * model position, in dots. Inverts per-type render offsets that the renderer
 * adds at draw time.
 *
 * Currently handles:
 * - QR (FO): subtracts the hardcoded +10 dot Y-offset that BarcodeObject adds
 *   to compensate for Zebra firmware artifact.
 * - 1D barcodes (FT): adds the new bar height back so obj.y stays on the
 *   bar baseline that ^FT anchors at. Without the correction every resize
 *   commits the bar TOP as the new obj.y and the next render shifts the
 *   barcode up by another bar-height.
 *
 * Text/serial pass through unchanged. obj.x/y is the position of the
 * unrotated wrapper Group around the (possibly rotated) inner Text. On
 * resize the Konva transformer pins the opposite corner of the Group's
 * axis-aligned clientRect — so obj.x/y naturally tracks the visible
 * pinned corner, the ZPL anchor offset is recomputed from the new
 * fontHeight at I/O time, and the round-trip stays exact. No inversion
 * needed here.
 */
export function modelPositionFromRenderedTopLeft(
  obj: LeafObject,
  renderedXDots: number,
  renderedYDots: number,
  newBarHeightDots?: number,
): { x: number; y: number } {
  if (obj.type === "qrcode" && obj.positionType !== "FT") {
    return { x: renderedXDots, y: renderedYDots - QR_FO_Y_OFFSET_DOTS };
  }
  if (
    obj.positionType === "FT" &&
    BARCODE_1D_TYPES.has(obj.type) &&
    newBarHeightDots !== undefined
  ) {
    return { x: renderedXDots, y: renderedYDots + newBarHeightDots };
  }
  return { x: renderedXDots, y: renderedYDots };
}

/** Inverse of `modelPositionFromRenderedTopLeft`: model → rendered. */
export function renderedTopLeftFromModel(obj: LeafObject): {
  x: number;
  y: number;
} {
  if (obj.type === "qrcode" && obj.positionType !== "FT") {
    return { x: obj.x, y: obj.y + QR_FO_Y_OFFSET_DOTS };
  }
  if (obj.positionType === "FT" && BARCODE_1D_TYPES.has(obj.type)) {
    const h = (obj.props as { height: number }).height;
    return { x: obj.x, y: obj.y - h };
  }
  return { x: obj.x, y: obj.y };
}
