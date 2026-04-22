import { expect } from 'vitest';

/** Assert that a value is defined and narrow its type. */
export function defined<T>(val: T | undefined | null): T {
  expect(val).toBeDefined();
  return val as T;
}

/** Extract props from a label object as a plain record for assertions. */
export const props = (obj: { props: unknown } | undefined): Record<string, unknown> =>
  (obj?.props ?? {}) as Record<string, unknown>;
