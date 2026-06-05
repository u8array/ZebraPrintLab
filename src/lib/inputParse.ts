// `<input type="number" min=...>` doesn't enforce min in onChange; helpers
// here convert raw strings into model-safe values.

/** Undefined on empty/unparsable; for optional fields. */
export function parseIntOrUndef(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Empty/NaN/sub-min collapse to min; for required hard-lower-bound fields. */
export function clampMin(raw: string, min: number): number {
  const n = Number(raw);
  return isNaN(n) || n < min ? min : n;
}

/** Asymmetric: clamps upper eagerly, lets non-negative sub-min through so
 *  mid-typing "12" (min=2) doesn't snap "1" to "2". Pair with clampBoundedInt on blur. */
export function readBoundedInt(raw: string, min: number, max: number): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return undefined;
  if (n >= 0 && n < min) return Math.min(max, n);
  return Math.min(max, Math.max(min, n));
}

/** onBlur-side final clamp for readBoundedInt. */
export function clampBoundedInt(raw: string, min: number, max: number): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}
