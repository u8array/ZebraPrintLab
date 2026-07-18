/** Strip keys whose value is `undefined`, returning a fresh object.
 *  PrinterProfile's "absent = printer default" semantics get corrupted
 *  by present-with-undefined keys after a JSON round-trip. */
export function pruneUndefined<T extends object>(input: Partial<T>): Partial<T> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) next[k] = v;
  }
  return next as Partial<T>;
}
