export const DPMM = 8;

export const pxToDots = (px: number, scale: number): number =>
  Math.round((px / scale) * DPMM);

export const dotsToPx = (dots: number, scale: number): number =>
  (dots / DPMM) * scale;

export const mmToDots = (mm: number): number =>
  Math.round(mm * DPMM);

export const dotsToMm = (dots: number): number =>
  Math.round((dots / DPMM) * 10) / 10;
