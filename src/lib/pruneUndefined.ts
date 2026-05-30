/** Strip own-enumerable keys whose value is `undefined`, returning a
 *  fresh object. Used at the boundary between sources that emit
 *  present-with-undefined keys (e.g. `Object.assign` of a parser
 *  result that explicitly cleared a field) and consumers that treat
 *  "field absent" as semantically different from "field present and
 *  undefined" (PrinterProfile in particular: absent = printer default,
 *  present-with-undefined would round-trip back into the persisted
 *  JSON and round through Zod as an unintended optional-write).
 *
 *  Pure, allocation-only (no mutation of input). Generic over the
 *  partial shape so callers don't have to re-assert the type. */
export function pruneUndefined<T extends object>(input: Partial<T>): Partial<T> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) next[k] = v;
  }
  return next as Partial<T>;
}
