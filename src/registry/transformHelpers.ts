import type { LabelObjectBase, TransformContext } from "../types/ObjectType";

/** Clamp a value into [min, max]. */
export function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
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

interface Stacked2DProps {
  rowHeight: number;
  moduleWidth: number;
}

/**
 * Shared commitTransform for stacked 2D barcodes (pdf417, micropdf417,
 * codablock). The drag-start anchor pins the rowHeight grid so the final
 * value matches the snap performed during the drag (boundBoxFunc).
 */
export function commitStacked2DTransform<P extends Stacked2DProps>(
  obj: LabelObjectBase & { props: P },
  ctx: TransformContext,
): Partial<P> {
  const { sx, sy, snap, nodeHeight, anchor } = ctx;
  const scaledH = nodeHeight * sy;
  const newRowHeight =
    anchor && anchor.nodeHeight > 0 && anchor.rowHeight > 0
      ? Math.max(1, Math.round((scaledH * anchor.rowHeight) / anchor.nodeHeight))
      : Math.max(1, snap(Math.round(obj.props.rowHeight * sy)));
  return {
    rowHeight: newRowHeight,
    moduleWidth: clamp(1, 10, Math.round(obj.props.moduleWidth * sx)),
  } as Partial<P>;
}
