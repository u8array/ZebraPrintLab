// CSS reference: 96 px/inch → px per mm at 100% zoom = physical label size
export const SCREEN_PX_PER_MM = 96 / 25.4;

export const pxToDots = (px: number, scale: number, dpmm: number): number =>
  Math.round((px / scale) * dpmm);

export const dotsToPx = (dots: number, scale: number, dpmm: number): number =>
  (dots / dpmm) * scale;

export const mmToDots = (mm: number, dpmm: number): number =>
  Math.round(mm * dpmm);

export const dotsToMm = (dots: number, dpmm: number): number =>
  Math.round((dots / dpmm) * 10) / 10;
