import { z } from "zod";

/** Hard bounds on `^FN` numbers in classic ZPL: 1-99. Newer firmware allows
 *  more, but staying inside the historical range keeps output portable. */
export const FN_NUMBER_MIN = 1;
export const FN_NUMBER_MAX = 99;

export const variableSchema = z.object({
  id: z.string(),
  name: z.string(),
  fnNumber: z.number().int().min(FN_NUMBER_MIN).max(FN_NUMBER_MAX),
  defaultValue: z.string(),
  comment: z.string().optional(),
});

export type Variable = z.infer<typeof variableSchema>;

export interface VariableInput {
  name: string;
  defaultValue?: string;
  /** Explicit slot. When omitted, the store assigns the next free number. */
  fnNumber?: number;
  comment?: string;
}

/** Returns the lowest unused fnNumber in [1, 99], or null when all 99 slots
 *  are taken. Callers should surface the null case to the UI rather than
 *  silently dropping the add. */
export function nextFreeFnNumber(used: readonly number[]): number | null {
  const taken = new Set(used);
  for (let n = FN_NUMBER_MIN; n <= FN_NUMBER_MAX; n++) {
    if (!taken.has(n)) return n;
  }
  return null;
}

/** Append `_2`, `_3`, … to `base` until it no longer collides with any
 *  existing variable's name. Shared between the parser (auto-naming from
 *  ^FX comments) and the importer (merging across multi-page blocks)
 *  so both paths produce the same disambiguation pattern. */
export function uniqueVariableName(
  base: string,
  existing: readonly Variable[],
): string {
  const taken = new Set(existing.map((v) => v.name));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
