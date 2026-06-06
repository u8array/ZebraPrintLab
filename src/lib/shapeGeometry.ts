// Pure geometry for ^GB/^GE/^GC/^GD. Outlines extrude inward; 2t >= min(w,h)
// collapses to solid. ^GD places the line on the parallelogram's left long edge.

export interface OutlineInset {
  /** t/2 unless filled. */
  offset: number;
  /** w - t unless filled. */
  width: number;
  /** h - t unless filled. */
  height: number;
  /** Firmware clamps outline to solid. */
  renderFilled: boolean;
}

export function outlineInset(
  w: number,
  h: number,
  t: number,
  filled: boolean,
  /** ^GB only: solid extends to max(w,t) x max(h,t); ^GE/^GC leave off. */
  promoteFilled = false,
): OutlineInset {
  const clampsToFilled = !filled && t * 2 >= Math.min(w, h);
  const renderFilled = filled || clampsToFilled;
  const fillW = promoteFilled ? Math.max(w, t) : w;
  const fillH = promoteFilled ? Math.max(h, t) : h;
  return {
    offset: renderFilled ? 0 : t / 2,
    width: renderFilled ? fillW : Math.max(0, w - t),
    height: renderFilled ? fillH : Math.max(0, h - t),
    renderFilled,
  };
}

/** Flat (x,y) tuple consumed by Konva.Line and 2D canvas paths. */
export type ParallelogramPoints = [
  number, number,
  number, number,
  number, number,
  number, number,
];

/** ^GD vertices; line on left long edge, +t in x. Validated against Labelary. */
export function diagonalPolygonPoints(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  t: number,
): ParallelogramPoints {
  const ddx = bx - ax;
  const ddy = by - ay;
  const w = Math.abs(ddx);
  const h = Math.abs(ddy);
  const orientation: "L" | "R" = ddx * ddy >= 0 ? "L" : "R";
  const boxX = ddx < 0 ? ax + ddx : ax;
  const boxY = ddy < 0 ? ay + ddy : ay;
  if (orientation === "L") {
    return [
      boxX,             boxY,
      boxX + t,         boxY,
      boxX + w + t,     boxY + h,
      boxX + w,         boxY + h,
    ];
  }
  return [
    boxX + w,         boxY,
    boxX + w + t,     boxY,
    boxX + t,         boxY + h,
    boxX,             boxY + h,
  ];
}
