import type { LeafObject } from "../../registry";
import { QR_FO_Y_OFFSET_DOTS, QR_FT_MODULE_OFFSET } from "../../lib/bwipConstants";
import { barcodeFtAnchorOffset, isBarcode } from "../../lib/objectBounds";
import { isAxisSwapped, objectRotation, type ZplRotation } from "../../registry/rotation";
import { getMeasuredSnapshot } from "./measuredBoundsCache";

/** Cached upright (unrotated) bar-rect size + HRI zone offsets (dots). Falls
 *  back to props.height for the H of a not-yet-rendered 1D barcode, else 0. */
function cacheBar(obj: LeafObject): { w: number; h: number; barLeft: number; barTop: number } {
  const m = getMeasuredSnapshot().get(obj.id);
  return {
    w: m?.uprightBarWDots ?? 0,
    h: m?.uprightBarHDots ?? (obj.props as { height?: number }).height ?? 0,
    barLeft: m?.barLeftDots ?? 0,
    barTop: m?.barTopDots ?? 0,
  };
}

/** Render delta for a ^FT barcode (rendered-top-left = obj + delta), mirroring
 *  objectBounds.barcodeTopLeft. The caller passes the committed upright size on a
 *  resize so the commit lands on the field anchor; dims are pre-swapped here. */
function ftBarcodeRenderDelta(
  obj: LeafObject,
  uprightW: number,
  uprightH: number,
  qrMagnification?: number,
): { x: number; y: number } {
  const { barLeft, barTop } = cacheBar(obj);
  const off = barcodeFtAnchorOffset(objectRotation(obj.props), uprightW, uprightH);
  const qrShift =
    obj.type === "qrcode"
      ? QR_FT_MODULE_OFFSET *
        (qrMagnification ?? (obj.props as { magnification: number }).magnification)
      : 0;
  return { x: off.x - barLeft, y: off.y - qrShift - barTop };
}

function isFtBarcode(obj: LeafObject): boolean {
  return obj.positionType === "FT" && isBarcode(obj);
}

/** Post-resize upright bar size (dots) from the continuous drag scale (R/B swap
 *  the drag axes, like effectiveScale). Use the continuous scale, not the snapped
 *  props: feeding the rounded props back makes rotated barcodes jump on release. */
export function committedUprightBarDots(
  rotation: ZplRotation,
  sx: number,
  sy: number,
  uprightW: number,
  uprightH: number,
): { w: number; h: number } {
  const swap = isAxisSwapped(rotation);
  return { w: uprightW * (swap ? sy : sx), h: uprightH * (swap ? sx : sy) };
}

/** Rendered top-left -> stored model position. QR FO subtracts the +10 Y
 *  artifact; FT barcodes invert the rotation-aware bar anchor. On a resize pass
 *  the committed upright bar size (`committedUprightW/H`, in dots) so the inverse
 *  uses the same dimensions the commit stores; omit it elsewhere to use the
 *  current rendered size. `committedMagnification` likewise pins the QR firmware
 *  shift to the post-resize magnification (uniform resize) so it stays lockstep. */
export function modelPositionFromRenderedTopLeft(
  obj: LeafObject,
  renderedXDots: number,
  renderedYDots: number,
  committedUprightW?: number,
  committedUprightH?: number,
  committedMagnification?: number,
): { x: number; y: number } {
  if (obj.type === "qrcode" && obj.positionType !== "FT") {
    return { x: renderedXDots, y: renderedYDots - QR_FO_Y_OFFSET_DOTS };
  }
  if (isFtBarcode(obj)) {
    const c = cacheBar(obj);
    const d = ftBarcodeRenderDelta(obj, committedUprightW ?? c.w, committedUprightH ?? c.h, committedMagnification);
    return { x: renderedXDots - d.x, y: renderedYDots - d.y };
  }
  return { x: renderedXDots, y: renderedYDots };
}

/** Inverse of `modelPositionFromRenderedTopLeft` at the current size. */
export function renderedTopLeftFromModel(obj: LeafObject): {
  x: number;
  y: number;
} {
  if (obj.type === "qrcode" && obj.positionType !== "FT") {
    return { x: obj.x, y: obj.y + QR_FO_Y_OFFSET_DOTS };
  }
  if (isFtBarcode(obj)) {
    const c = cacheBar(obj);
    const d = ftBarcodeRenderDelta(obj, c.w, c.h);
    return { x: obj.x + d.x, y: obj.y + d.y };
  }
  return { x: obj.x, y: obj.y };
}
