import { BARCODE_1D_TYPES, type LabelObject } from "../../registry";
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
 * Used by onTransformEnd to mirror the rendered→model conversion that
 * BarcodeObject.handleDragEnd performs for drag.
 *
 * Note: QR-FT correction is not yet implemented (the additional firmware
 * 3-module offset would need a separate code path); FT resize on QR still
 * drifts.
 */
export function modelPositionFromRenderedTopLeft(
  obj: LabelObject,
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
