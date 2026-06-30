import type { PreflightCtx, PreflightProducerResult } from "../types/preflight";

/** Recommended minimum barcode module / X-dimension in mm for reliable general
 *  scanning, per GS1/AIM guidance (~0.25 mm). Below this the preflight warns.
 *  Shared floor for 1D X-dimension and 2D cell size. */
export const MIN_BARCODE_MODULE_MM = 0.25;

/** A `barcodeTooSmall` finding when the module size (dots) is below the minimum
 *  scannable X-dimension at the device density. Used by every 1D and 2D type. */
export function moduleTooSmallFindings(moduleDots: number, dpmm: number): PreflightProducerResult[] {
  const mm = moduleDots / dpmm;
  if (!(mm < MIN_BARCODE_MODULE_MM)) return []; // also short-circuits NaN/Infinity
  return [{ kind: "barcodeTooSmall", detail: `${mm.toFixed(2)} mm (min ${MIN_BARCODE_MODULE_MM} mm)` }];
}

/** Curried registry `preflight` producer: warns when the named module-size prop
 *  (e.g. moduleWidth, magnification, dimension) is below the min X-dimension.
 *  One source for the scannability check every 1D/2D barcode type registers. */
export function moduleTooSmallPreflight<P extends object>(
  prop: keyof P & string,
): (obj: { props: P }, ctx: PreflightCtx) => PreflightProducerResult[] {
  return (obj, ctx) => moduleTooSmallFindings(obj.props[prop] as number, ctx.label.dpmm);
}
