// Module-level measured-footprint cache, published by the render layer for the
// object types whose size is not purely computable (barcodes, single-line text,
// serial, image). Deliberately NOT zustand: writes happen every render and must
// never trigger a re-render. The align handler reads it as ctx.measured.
//
// Convention: store the ALREADY-ROTATED visual footprint in dots, keyed by
// obj.id. objectBounds.ts consumes it verbatim for these types.

export interface MeasuredFootprint {
  width: number;
  height: number;
  /** Rotation-aware bar sub-rect height in dots (barcodes only), mirroring the
   *  renderer's FT anchor shift. Lets objectBounds place an FT-anchored barcode
   *  bbox correctly for R/B rotations, where the bar extent is not props.height. */
  barHeightDots?: number;
  /** Text-zone offset (dots) from the bbox top-left to the bars, mirroring the
   *  renderer's `(-barLeftPx, -barTopPx)` shift. Non-zero when the HRI text zone
   *  sits left of (rotated EAN/UPC) or above (inverted/above-HRI) the bars. */
  barLeftDots?: number;
  barTopDots?: number;
}

const cache = new Map<string, MeasuredFootprint>();

export function setMeasuredBounds(id: string, footprint: MeasuredFootprint): void {
  cache.set(id, footprint);
}

export function getMeasuredBounds(id: string): MeasuredFootprint | undefined {
  return cache.get(id);
}

export function clearMeasuredBounds(id: string): void {
  cache.delete(id);
}

/** The live map for the align handler's ctx.measured. Returned as-is (readonly
 *  at the call site) so reads stay zero-copy. */
export function measuredBoundsMap(): ReadonlyMap<string, MeasuredFootprint> {
  return cache;
}
