import type { LeafObject } from "@zplab/core/registry/index";
import { objectBoundsDots, type ObjectBoundsCtx } from "@zplab/core/lib/objectBounds";

export const positionTypeOf = (obj: { positionType?: "FO" | "FT" }): "FO" | "FT" =>
  obj.positionType === "FT" ? "FT" : "FO";

/** Whether the ^FO/^FT toggle can re-anchor `type` while holding the visual
 *  position constant. Excludes `symbol` (^GS): it emits a raw, uncompensated
 *  anchor (registry `fieldPos`) yet its bounds are anchor-independent, so a ^FT
 *  flip would shift the printed glyph to its baseline with no editor change and
 *  no verified offset. See [[project_ticket_symbol_ft_anchor]]. */
export function supportsPositionToggle(type: string): boolean {
  return type !== "symbol";
}

/** The model patch that re-anchors `obj` as `target` (^FO/^FT) with its visual
 *  position unchanged, or null when there is nothing to convert. Inverts the
 *  shared bounds numerically: flip the flag, measure the box shift, compensate
 *  x/y. That inherits every anchor rule from objectBoundsDots (rotation-aware
 *  ^FT offsets, QR firmware shifts, HRI zone), so the conversion cannot drift
 *  from what canvas and emit agree on. Text and graphics are anchor-independent
 *  (delta zero, flag only). Barcodes need their measured footprint; this stays
 *  permissive (fallback dims keep before/after consistent), the canvas handle
 *  refuses unmeasured ones. */
export function convertPositionType(
  obj: LeafObject,
  target: "FO" | "FT",
  ctx: ObjectBoundsCtx,
): { positionType: "FO" | "FT"; x: number; y: number } | null {
  if (!supportsPositionToggle(obj.type)) return null;
  if (positionTypeOf(obj) === target) return null;
  const before = objectBoundsDots(obj, ctx);
  const after = objectBoundsDots({ ...obj, positionType: target } as LeafObject, ctx);
  return {
    positionType: target,
    x: Math.round(obj.x + before.x - after.x),
    y: Math.round(obj.y + before.y - after.y),
  };
}
