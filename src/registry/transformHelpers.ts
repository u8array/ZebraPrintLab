import type { LabelObjectBase, TransformContext } from "../types/ObjectType";

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
    moduleWidth: Math.max(1, Math.min(10, Math.round(obj.props.moduleWidth * sx))),
  } as Partial<P>;
}
