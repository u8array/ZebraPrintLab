/**
 * Helpers for sanitising raw `<input>` values into typed model fields.
 *
 * `<input type="number" min="…">` enforces nothing on the value the change
 * handler receives — `min` is only a UI hint and `Number("")` collapses to 0.
 * These helpers give callers a one-liner that turns the raw string into
 * a value the model can safely accept.
 */

/**
 * Parses an integer from a raw input value, returning `undefined` when the
 * field is empty or unparsable. Use for optional number fields where
 * "absent" is a valid persisted state.
 */
export function parseIntOrUndef(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = parseInt(raw, 10);
  return isNaN(n) ? undefined : n;
}

/**
 * Parses a number from a raw input value and clamps it to at least `min`.
 * Empty / NaN / sub-min inputs collapse to `min`. Use for required number
 * fields that need a hard lower bound (shape dimensions, line widths).
 */
export function clampMin(raw: string, min: number): number {
  const n = Number(raw);
  return isNaN(n) || n < min ? min : n;
}

/**
 * Parses an integer from a raw input value, clamping the UPPER bound
 * eagerly while letting intermediate values BELOW `min` pass through
 * unchanged. Returns `undefined` for empty / unparsable input.
 *
 * The asymmetric clamp keeps `onChange` from sabotaging the user
 * mid-typing: with `min=2` a user keying "12" first types "1", which
 * would otherwise snap to "2" and turn the next keystroke into "22"
 * (→ clamped to max). Allowing positive sub-`min` values to stay
 * lets the user finish typing; pair with a final-clamp on blur via
 * `clampBoundedInt` to pin the committed value back into range.
 */
export function readBoundedInt(raw: string, min: number, max: number): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return undefined;
  if (n >= 0 && n < min) return Math.min(max, n);
  return Math.min(max, Math.max(min, n));
}

/**
 * Final-clamp helper paired with `readBoundedInt` for input `onBlur`.
 * Forces the value back into `[min, max]` once the user stops typing,
 * so an intermediate sub-min input doesn't persist after edit.
 */
export function clampBoundedInt(raw: string, min: number, max: number): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}
