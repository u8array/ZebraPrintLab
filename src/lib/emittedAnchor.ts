import type { LeafObject } from "../registry";
import { graphicAnchorCoords, textZplAnchorCoords } from "../registry/zplHelpers";
import { objectBoundsDots, type BoundingBoxDots, type ObjectBoundsCtx } from "./objectBounds";

/** Graphic types whose ^FT anchor is a bottom corner, not the model top-left. */
const FT_BOTTOM_ANCHOR_TYPES = new Set<string>(["box", "ellipse", "image", "line"]);

/** The ^FO/^FT origin (dots) the generator actually emits for this leaf, i.e.
 *  the coordinate the printer sees. The single source the off-label preflight
 *  shares with emission, so "is the position off-label" can't drift from what
 *  prints: text uses the cap-top/baseline transform, an ^FT graphic anchors a
 *  bottom corner, everything else (barcodes, symbol, ^FO graphics) emits at the
 *  model coord. Pass `box` when the caller already has the bbox to skip a
 *  recompute (only ^FT graphics need it). */
export function emittedAnchorDots(
  obj: LeafObject,
  ctx: ObjectBoundsCtx,
  box?: BoundingBoxDots,
): { x: number; y: number } {
  if (obj.type === "text") {
    const { x, y } = textZplAnchorCoords(obj as Parameters<typeof textZplAnchorCoords>[0]);
    return { x, y };
  }
  if (obj.positionType === "FT" && FT_BOTTOM_ANCHOR_TYPES.has(obj.type)) {
    const b = box ?? objectBoundsDots(obj, ctx);
    return graphicAnchorCoords(b.x, b.y, b.width, b.height, "FT", obj.fieldJustify);
  }
  return { x: obj.x, y: obj.y };
}
