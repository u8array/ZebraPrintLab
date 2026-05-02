import type Konva from "konva";

export interface LassoRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Returns IDs whose Konva node's stage-relative client rect intersects the
 * lasso rect. Pure function over the stage's current geometry.
 */
export function getIdsIntersectingRect(
  stage: Konva.Stage,
  candidateIds: string[],
  rect: LassoRect,
): string[] {
  return candidateIds.filter((id) => {
    const node = stage.findOne<Konva.Node>(`#${id}`);
    if (!node) return false;
    const box = node.getClientRect({ relativeTo: stage });
    return (
      rect.x < box.x + box.width &&
      rect.x + rect.w > box.x &&
      rect.y < box.y + box.height &&
      rect.y + rect.h > box.y
    );
  });
}
