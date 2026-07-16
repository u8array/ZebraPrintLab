import type Konva from "konva";

/** Konva node name marking a shape whose interior is click-through. Stamped by
 *  shapeHitProps (konvaObjectProps) so both hit rules share one decision;
 *  declared here to keep this module free of React/store dependencies. */
export const HOLLOW_HIT_NAME = "hollow-hit";

export interface LassoRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ClientBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Duck-typed slice of a Konva shape, so tests can fake nodes without Konva. */
interface ShapeLike {
  className?: string;
  strokeWidth?: () => number;
  hitStrokeWidth?: () => number | string;
  cornerRadius?: () => number;
}

/** Parity with shapeHitProps: a shape it marked with HOLLOW_HIT_NAME is
 *  click-through in its interior, so a lasso fully inside that frame (hit
 *  ring excluded) must not capture it either. */
function insideHollowFrame(node: Konva.Node, rect: LassoRect, box: ClientBox): boolean {
  const shape = (
    node as unknown as { findOne?: (selector: string) => ShapeLike | undefined }
  ).findOne?.(`.${HOLLOW_HIT_NAME}`);
  if (!shape) return false;
  const stroke = shape.strokeWidth?.() ?? 0;
  const hit = shape.hitStrokeWidth?.();
  const hitWidth = typeof hit === "number" ? hit : stroke;
  // The stroke path sits strokeWidth/2 inside the bbox edge (outlineInset) and
  // the hit ring extends hitStrokeWidth/2 to each side of it.
  const inset = stroke / 2 + hitWidth / 2;
  const corners: [number, number][] = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h],
  ];
  if (shape.className === "Rect") {
    const x0 = box.x + inset;
    const y0 = box.y + inset;
    const x1 = box.x + box.width - inset;
    const y1 = box.y + box.height - inset;
    if (!(rect.x > x0 && rect.y > y0 && rect.x + rect.w < x1 && rect.y + rect.h < y1)) {
      return false;
    }
    // The node's cornerRadius is already the path radius; the free interior
    // rounds off hitStrokeWidth/2 tighter.
    const r = (shape.cornerRadius?.() ?? 0) - hitWidth / 2;
    if (r <= 0) return true;
    // Point-in-rounded-rect via distance to the nearest corner circle.
    return corners.every(([px, py]) => {
      const dx = Math.max(x0 + r - px, px - (x1 - r), 0);
      const dy = Math.max(y0 + r - py, py - (y1 - r), 0);
      return dx * dx + dy * dy < r * r;
    });
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const irx = box.width / 2 - inset;
  const iry = box.height / 2 - inset;
  if (irx <= 0 || iry <= 0) return false;
  // A rect lies inside the (convex) inner ellipse iff all four corners do.
  return corners.every(([px, py]) => ((px - cx) / irx) ** 2 + ((py - cy) / iry) ** 2 < 1);
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
      rect.y + rect.h > box.y &&
      !insideHollowFrame(node, rect, box)
    );
  });
}
