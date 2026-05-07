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
