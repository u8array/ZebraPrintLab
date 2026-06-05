import type { LabelObjectBase } from "../types/LabelObject";
import type { TransformContext } from "../types/ZplEmit";
/** Clamp a value into [min, max]. */
export function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

/** R/B rotation swaps sx/sy so commits stay in pre-rotation x/y props. */
export function effectiveScale(
  rotation: "N" | "R" | "I" | "B" | undefined,
  ctx: TransformContext,
): { esx: number; esy: number } {
  const swap = rotation === "R" || rotation === "B";
  return swap
    ? { esx: ctx.sy, esy: ctx.sx }
    : { esx: ctx.sx, esy: ctx.sy };
}

/** Uniform 2D commit factory; prop name + range closed over per registry. */
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

/** Axis-aligned (box/ellipse); rotated types use commitRotatedWidthHeightTransform. */
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

/** width/height are pre-rotation; effectiveScale handles R/B drag axis. */
export function commitRotatedWidthHeightTransform<
  P extends WidthHeightProps & { rotation: "N" | "R" | "I" | "B" },
>(
  obj: LabelObjectBase & { props: P },
  ctx: TransformContext,
): Partial<P> {
  return commitRotatedSizeTransform(obj, ctx, "width", "height");
}

function commitRotatedSizeTransform<
  P extends { rotation: "N" | "R" | "I" | "B" },
  XK extends keyof P,
  YK extends keyof P,
>(
  obj: LabelObjectBase & { props: P },
  ctx: TransformContext,
  xKey: XK,
  yKey: YK,
): Partial<P> {
  const { esx, esy } = effectiveScale(obj.props.rotation, ctx);
  const oldX = obj.props[xKey] as unknown as number;
  const oldY = obj.props[yKey] as unknown as number;
  return {
    [xKey]: Math.max(1, ctx.snap(Math.round(oldX * esx))),
    [yKey]: Math.max(1, ctx.snap(Math.round(oldY * esy))),
  } as Partial<P>;
}

/** moduleWidth clamped to ^BY [1,10]; bitmap stretches mid-drag, rounded on release. */
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

/** Drag-start anchor pins the rowHeight grid so commit matches the in-drag snap. */
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
