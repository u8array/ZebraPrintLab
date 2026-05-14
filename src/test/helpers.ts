import { expect } from 'vitest';

/** Assert that a value is defined and narrow its type. */
export function defined<T>(val: T | undefined | null): T {
  expect(val).toBeDefined();
  return val as T;
}

/** Extract props from a label object as a plain record for assertions.
 *  Accepts the wide LabelObject union: groups have no `props`, so the
 *  field is optional here and treated as an empty record. The `type`
 *  field is required only to keep the parameter shape compatible with
 *  GroupObject (which has no `props` key at all — without `type` as a
 *  common field, TS rejects the union assignment). */
export const props = (
  obj: { type?: string; props?: unknown } | undefined,
): Record<string, unknown> =>
  (obj?.props ?? {}) as Record<string, unknown>;
