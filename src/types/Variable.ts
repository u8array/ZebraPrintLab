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

/** Auto-generated default name for a freshly added variable: `var_N`
 *  where N is the lowest integer that yields a unique name in the
 *  current set. Used both by the Variables panel's add button and by
 *  the mapping modal's inline add. Keeps the naming convention in
 *  one place. */
export function nextDefaultVariableName(existing: readonly Variable[]): string {
  const taken = new Set(existing.map((v) => v.name));
  let i = 1;
  while (taken.has(`var_${i}`)) i++;
  return `var_${i}`;
}

/** Persistent mapping between document Variables and CSV columns.
 *  Lives in the design file (design.json) because it is design-time
 *  config: it references variable.id (only meaningful inside this
 *  document) and dictates how the data feeds the template. Header
 *  NAME, not index, so column reorders between imports don't break
 *  the mapping. */
/** Parse options remembered alongside the mapping so a re-import of
 *  the same logical dataset uses the same delimiter / encoding /
 *  headerless decision without the user having to re-pick them.
 *  Optional fields: omission means "use default" (auto-detect
 *  delimiter, UTF-8 encoding, header-row present, no rows skipped).
 *  Persisted in design.json so the choice survives Save/Load. */
export const csvParseOptionsPersistedSchema = z.object({
  delimiter: z.string().optional(),
  hasHeaderRow: z.boolean().optional(),
  skipRows: z.number().int().min(0).optional(),
  encoding: z.string().optional(),
});
export type CsvParseOptionsPersisted = z.infer<typeof csvParseOptionsPersistedSchema>;

export const csvMappingSchema = z.object({
  /** variableId → header name. Variables without an entry fall back
   *  to their defaultValue when the dataset is active. */
  bindings: z.record(z.string(), z.string()),
  /** Snapshot of the headers the mapping was made against. Empty
   *  array = no CSV ever imported (mapping shouldn't exist either).
   *  Re-import with a different header set triggers a UI warning. */
  headerSnapshot: z.array(z.string()),
  /** Parse options used when the mapping was last applied. Re-used
   *  on re-import so the same delimiter/encoding/headerless choice
   *  applies without the user re-picking. Optional for back-compat
   *  with mappings saved before this field existed. */
  parseOptions: csvParseOptionsPersistedSchema.optional(),
});
export type CsvMapping = z.infer<typeof csvMappingSchema>;

/** Whether a saved CsvMapping still lines up with a freshly parsed
 *  set of headers, so the caller can decide if the mapping can be
 *  reused silently or needs user review. In headerless mode
 *  (`parseOptions.hasHeaderRow === false`) column count is what
 *  matters — synthetic `Column N` names line up trivially when
 *  counts match. In normal header-row mode the comparison is
 *  order-independent on the set of header names so reordered Excel
 *  exports stay compatible. */
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

/** Loose header-name comparison for auto-suggesting CSV → Variable
 *  matches at import time. Case-insensitive; spaces, dashes and
 *  underscores collapse so `"Product Code"`, `"product_code"` and
 *  `"ProductCode"` all match a variable named `productCode`. */
export function normalizeHeaderForMatch(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "");
}

/** Build a `variableId → headerName` mapping by matching each variable
 *  against the supplied CSV headers via `normalizeHeaderForMatch`.
 *  Variables with no match are absent from the output (caller can
 *  surface them in the modal so the user picks manually). Each header
 *  is consumed at most once; ties go to the first variable in `variables`. */
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
