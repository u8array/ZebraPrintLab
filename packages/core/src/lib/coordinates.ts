// CSS reference: 96 px/inch → px per mm at 100% zoom = physical label size
export const SCREEN_PX_PER_MM = 96 / 25.4;

/** Exact (unrounded) inverse of dotsToPx. Callers that rebuild geometry from
 *  two screen points (e.g. centred line resize) must keep the fractional value
 *  so a diagonal's true length/angle survives; rounding each point first can
 *  inflate the length or drop the angle. */
export const pxToDotsExact = (px: number, scale: number, dpmm: number): number =>
  (px / scale) * dpmm;

export const pxToDots = (px: number, scale: number, dpmm: number): number =>
  Math.round(pxToDotsExact(px, scale, dpmm));

export const dotsToPx = (dots: number, scale: number, dpmm: number): number =>
  (dots / dpmm) * scale;

export const mmToDots = (mm: number, dpmm: number): number =>
  Math.round(mm * dpmm);

export const dotsToMm = (dots: number, dpmm: number): number =>
  Math.round((dots / dpmm) * 10) / 10;
