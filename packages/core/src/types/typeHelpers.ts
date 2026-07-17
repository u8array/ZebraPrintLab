import { z } from 'zod';

/** Factory for runtime type guards from a tuple of literal string
 *  values. Lets parser and UI share a single discriminator per enum. */
export function makeEnumGuard<T extends string>(values: readonly T[]): (v: string) => v is T {
  const set: ReadonlySet<string> = new Set(values);
  return (v): v is T => set.has(v);
}

/** Applies a `{min, max}` range to a zod integer chain. */
export function intInRange(r: { min: number; max: number }) {
  return z.number().int().min(r.min).max(r.max);
}
