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

// useSyncExternalStore plumbing. The cache stays non-reactive for the hot
// per-render writes; `snapshot` is rebuilt only when a footprint actually
// changes, so its identity is stable between renders and changes exactly when a
// consumer (the selection frame) must recompute.
let snapshot: ReadonlyMap<string, MeasuredFootprint> = cache;
const listeners = new Set<() => void>();

export function subscribeMeasuredBounds(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Immutable snapshot for useSyncExternalStore; identity changes only on a real
 *  footprint change, so getSnapshot stays cache-stable between renders. */
export function getMeasuredSnapshot(): ReadonlyMap<string, MeasuredFootprint> {
  return snapshot;
}

function emitChange(): void {
  snapshot = new Map(cache);
  for (const fn of listeners) fn();
}

function footprintsEqual(a: MeasuredFootprint, b: MeasuredFootprint): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.barHeightDots === b.barHeightDots &&
    a.barLeftDots === b.barLeftDots &&
    a.barTopDots === b.barTopDots
  );
}

export function setMeasuredBounds(id: string, footprint: MeasuredFootprint): void {
  const prev = cache.get(id);
  if (prev && footprintsEqual(prev, footprint)) return;
  cache.set(id, footprint);
  emitChange();
}

export function getMeasuredBounds(id: string): MeasuredFootprint | undefined {
  return cache.get(id);
}

export function clearMeasuredBounds(id: string): void {
  if (cache.delete(id)) emitChange();
}

/** The live map for the align handler's ctx.measured. Returned as-is (readonly
 *  at the call site) so reads stay zero-copy. */
export function measuredBoundsMap(): ReadonlyMap<string, MeasuredFootprint> {
  return cache;
}
