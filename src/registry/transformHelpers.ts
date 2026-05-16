import type { LabelObjectBase, TransformContext } from "../types/ObjectType";

/** Clamp a value into [min, max]. */
export function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

/** ZPL rotates the rendered content but the Konva wrapper Group stays
 *  axis-aligned, so `sx`/`sy` from the transformer are always in screen
 *  space. For rotation R / B (90° / 270°) the user's screen-vertical
 *  drag therefore targets the pre-rotation X axis (text/bar-width)
 *  rather than the pre-rotation Y axis (height) — swap the two so each
 *  commit helper can keep talking about "x-prop" and "y-prop" without
 *  having to know about rotation. N and I both leave the axes aligned. */
export function effectiveScale(
  rotation: "N" | "R" | "I" | "B" | undefined,
  ctx: TransformContext,
): { esx: number; esy: number } {
  const swap = rotation === "R" || rotation === "B";
  return swap
    ? { esx: ctx.sy, esy: ctx.sx }
    : { esx: ctx.sx, esy: ctx.sy };
}

/**
 * Factory for commitTransform on uniformly-scaling 2D codes (QR, Aztec,
 * DataMatrix): a single integer module-size prop scales by min(sx, sy)
 * and clamps to [min, max]. The prop name and range vary per code, so they
 * are closed over at registry-definition time.
 */
export function commitUniformScaleTransform<
  K extends string,
  P extends Record<K, number> = Record<K, number>,
>(propName: K, min: number, max: number) {
  return (obj: LabelObjectBase & { props: P }, ctx: TransformContext): Partial<P> => {
    const next = clamp(min, max, Math.round(obj.props[propName] * Math.min(ctx.sx, ctx.sy)));
    return { [propName]: next } as Partial<P>;
  };
}

interface WidthHeightProps {
  width: number;
  height: number;
}

/** Shared commitTransform for shapes that scale width and height independently (box, ellipse). */
export function commitWidthHeightTransform<P extends WidthHeightProps>(
  obj: LabelObjectBase & { props: P },
  ctx: TransformContext,
): Partial<P> {
  const { sx, sy, snap } = ctx;
  return {
    width: Math.max(1, snap(Math.round(obj.props.width * sx))),
    height: Math.max(1, snap(Math.round(obj.props.height * sy))),
  } as Partial<P>;
}

/**
 * commitTransform for 1D barcodes. Vertical drag scales bar height,
 * horizontal drag scales the module width — the latter is clamped to
 * the ZPL `^BY` range [1, 10]. During the drag the bitmap stretches
 * free-form for visual feedback; this commit rounds the result to a
 * valid integer moduleWidth on release.
 *
 * `effectiveScale` swaps sx/sy for R/B-rotated barcodes so user's
 * screen-vertical drag stays attached to bar height regardless of how
 * the bitmap is oriented on screen.
 */
export function commitBarcodeWidthHeightTransform<
  P extends { height: number; moduleWidth: number; rotation: "N" | "R" | "I" | "B" },
>(
  obj: LabelObjectBase & { props: P },
  ctx: TransformContext,
): Partial<P> {
  const { snap } = ctx;
  const { esx, esy } = effectiveScale(obj.props.rotation, ctx);
  return {
    height: Math.max(1, snap(Math.round(obj.props.height * esy))),
    moduleWidth: clamp(1, 10, Math.round(obj.props.moduleWidth * esx)),
  } as Partial<P>;
}

interface Stacked2DProps {
  rowHeight: number;
  moduleWidth: number;
}

/**
 * Shared commitTransform for stacked 2D barcodes (pdf417, micropdf417,
 * codablock). The drag-start anchor pins the rowHeight grid so the final
 * value matches the snap performed during the drag (boundBoxFunc).
 * Rotation-aware via `effectiveScale`, same reasoning as the 1D helper.
 */
export function commitStacked2DTransform<
  P extends Stacked2DProps & { rotation: "N" | "R" | "I" | "B" },
>(
  obj: LabelObjectBase & { props: P },
  ctx: TransformContext,
): Partial<P> {
  const { snap, nodeHeight, anchor } = ctx;
  const { esx, esy } = effectiveScale(obj.props.rotation, ctx);
  const scaledH = nodeHeight * esy;
  const newRowHeight =
    anchor && anchor.nodeHeight > 0 && anchor.rowHeight > 0
      ? Math.max(1, Math.round((scaledH * anchor.rowHeight) / anchor.nodeHeight))
      : Math.max(1, snap(Math.round(obj.props.rowHeight * esy)));
  return {
    rowHeight: newRowHeight,
    moduleWidth: clamp(1, 10, Math.round(obj.props.moduleWidth * esx)),
  } as Partial<P>;
}
