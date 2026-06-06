import { z } from "zod";

/** Classic ZPL ^FN bounds; newer firmware allows more but stay portable. */
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

/** Lowest unused fnNumber in [1, 99], or null when all 99 taken. */
export function nextFreeFnNumber(used: readonly number[]): number | null {
  const taken = new Set(used);
  for (let n = FN_NUMBER_MIN; n <= FN_NUMBER_MAX; n++) {
    if (!taken.has(n)) return n;
  }
  return null;
}

/** True iff names+fnNumbers are non-empty, in-range, and unique. */
export function validateVariablesUnique(variables: readonly Variable[]): boolean {
  const names = new Set<string>();
  const fns = new Set<number>();
  for (const v of variables) {
    const trimmed = v.name.trim();
    if (trimmed === '' || names.has(trimmed)) return false;
    names.add(trimmed);
    if (v.fnNumber < FN_NUMBER_MIN || v.fnNumber > FN_NUMBER_MAX) return false;
    if (fns.has(v.fnNumber)) return false;
    fns.add(v.fnNumber);
  }
  return true;
}

/** Append `_2`, `_3`, ... until unique. */
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

/** `var_N` with lowest N that yields a unique name. */
export function nextDefaultVariableName(existing: readonly Variable[]): string {
  const taken = new Set(existing.map((v) => v.name));
  let i = 1;
  while (taken.has(`var_${i}`)) i++;
  return `var_${i}`;
}

/** Parse options remembered so re-import uses the same delimiter/encoding/
 *  header decision. Omission = default (auto-detect, UTF-8, header present). */
export const csvParseOptionsPersistedSchema = z.object({
  delimiter: z.string().optional(),
  hasHeaderRow: z.boolean().optional(),
  skipRows: z.number().int().min(0).optional(),
  encoding: z.string().optional(),
});
export type CsvParseOptionsPersisted = z.infer<typeof csvParseOptionsPersistedSchema>;

export const csvMappingSchema = z.object({
  /** variableId -> header name. Missing entries fall back to defaultValue. */
  bindings: z.record(z.string(), z.string()),
  /** Headers the mapping was made against; differing re-imports trigger warning. */
  headerSnapshot: z.array(z.string()),
  /** Parse options at last apply; optional for back-compat. */
  parseOptions: csvParseOptionsPersistedSchema.optional(),
});
export type CsvMapping = z.infer<typeof csvMappingSchema>;

/** Mapping <-> headers compatibility. Headerless: column-count match.
 *  Header-row: order-independent name-set match. */
export function isMappingCompatibleWith(
  mapping: CsvMapping,
  headers: readonly string[],
): boolean {
  const headerless = mapping.parseOptions?.hasHeaderRow === false;
  if (headerless) return mapping.headerSnapshot.length === headers.length;
  if (mapping.headerSnapshot.length !== headers.length) return false;
  const known = new Set(mapping.headerSnapshot);
  for (const h of headers) if (!known.has(h)) return false;
  return true;
}

/** Loose header match: case-insensitive, collapse spaces/dashes/underscores. */
export function normalizeHeaderForMatch(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "");
}

/** variableId -> headerName via normalizeHeaderForMatch; each header
 *  consumed at most once, ties go to first variable. */
export function suggestCsvMapping(
  variables: readonly Variable[],
  headers: readonly string[],
): Record<string, string> {
  const taken = new Set<string>();
  const bindings: Record<string, string> = {};
  for (const v of variables) {
    const normName = normalizeHeaderForMatch(v.name);
    const match = headers.find(
      (h) => !taken.has(h) && normalizeHeaderForMatch(h) === normName,
    );
    if (match !== undefined) {
      bindings[v.id] = match;
      taken.add(match);
    }
  }
  return bindings;
}
