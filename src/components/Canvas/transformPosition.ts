import { BARCODE_1D_TYPES } from "../../registry";
import type { LeafObject } from "../../registry";
import { QR_FO_Y_OFFSET_DOTS } from "./bwipConstants";

/** QR FO: subtract Zebra-artifact +10 Y. 1D FT: add new bar height back
 *  so obj.y stays on the FT baseline (else resize walks barcode up). */
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
