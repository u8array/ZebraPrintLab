import type { LabelObject } from "../types/Group";
import type { CsvMapping, Variable } from "../types/Variable";

/**
 * Resolve an object's `variableId` against the variable list and return
 * the bound Variable, or `undefined` when the object is unbound or its
 * binding points at a variable that no longer exists (orphan).
 */
export function lookupBoundVariable(
  obj: LabelObject,
  variables: readonly Variable[],
): Variable | undefined {
  if (!obj.variableId) return undefined;
  return variables.find((v) => v.id === obj.variableId);
}

/** How a bound variable should be visualised on the canvas. `preview`
 *  shows the actual content that would print (CSV row or default);
 *  `schema` shows a `«name»` placeholder so the user sees structure
 *  without data. Matches the established print-design idiom
 *  (InDesign Data Merge, Word Mail Merge). */
export type RenderMode = "preview" | "schema";

/**
 * Resolve which string a bound Variable currently represents. Default
 * is `variable.defaultValue` (template fallback). When an active CSV
 * row is supplied, a binding for this Variable in the mapping picks
 * the corresponding cell instead. Empty cells render as empty
 * strings (no fallback to defaultValue), so a deliberate blank in
 * the CSV stays visible.
 *
 * In `schema` mode, returns `«variableName»` regardless of CSV state.
 */
export function resolveVariableValue(
  variable: Variable,
  active: ActiveCsvRow | null,
  mode: RenderMode = "preview",
): string {
  if (mode === "schema") return `«${variable.name}»`;
  if (!active) return variable.defaultValue;
  const header = active.mapping.bindings[variable.id];
  if (header === undefined) return variable.defaultValue;
  const idx = active.headers.indexOf(header);
  if (idx === -1) return variable.defaultValue;
  return active.row[idx] ?? "";
}

/** Where a Variable's currently-rendered value comes from. Surfaced as
 *  a status badge across the Variables panel + mapping modal so the
 *  user can tell at a glance whether a value is data-driven, falling
 *  back to default, or has a broken mapping. */
export type VariableSource = "csv" | "orphan" | "default";

/** Classify a variable against the current CSV state. `csv`: bound to
 *  a header that exists in the active dataset. `orphan`: bound but
 *  the header is missing (mapping is stale, value falls back to
 *  defaultValue). `default`: not bound (intentionally or because no
 *  CSV is loaded at all). Pure — works with or without csvDataset. */
export function getVariableSource(
  variable: Variable,
  csvDataset: { headers: readonly string[] } | null,
  csvMapping: CsvMapping | null,
): VariableSource {
  const header = csvMapping?.bindings[variable.id];
  if (header === undefined) return "default";
  if (!csvDataset) return "default";
  return csvDataset.headers.includes(header) ? "csv" : "orphan";
}

/** Snapshot of the currently active CSV row plus the mapping needed
 *  to resolve a Variable to a cell. Caller assembles this from store
 *  state so this lib stays unaware of the store layer. */
export interface ActiveCsvRow {
  headers: readonly string[];
  row: readonly string[];
  mapping: CsvMapping;
}

/** Assemble an ActiveCsvRow from the loose store-side inputs (the
 *  store can't expose ActiveCsvRow directly without depending on
 *  this lib). Returns null when there's nothing to substitute:
 *  no dataset, no mapping, or the active index is out of bounds. */
export function buildActiveCsvRow(
  csvDataset: {
    headers: readonly string[];
    rows: readonly (readonly string[])[];
    activeRowIndex: number;
  } | null,
  csvMapping: CsvMapping | null,
): ActiveCsvRow | null {
  if (!csvDataset || !csvMapping) return null;
  const row = csvDataset.rows[csvDataset.activeRowIndex];
  if (!row) return null;
  return { headers: csvDataset.headers, row, mapping: csvMapping };
}

/**
 * Return `obj` with `props.content` swapped for the bound Variable's
 * resolved value (see `resolveVariableValue`), so canvas renderers
 * preview exactly what would print for the current CSV row (or the
 * defaultValue when no row data feeds this binding). Identity-
 * preserving: returns the same reference when the object isn't
 * bound or already carries the resolved value, so React's
 * referential-equality optimisations stay effective.
 *
 * Every bindable type today exposes `props.content` (text and the
 * barcode types tagged `bindable: true` in the registry). Non-
 * bindable types never have a `variableId`, so the early return
 * covers them.
 */
export function applyBindingToObject<T extends LabelObject>(
  obj: T,
  variables: readonly Variable[],
  active: ActiveCsvRow | null = null,
  mode: RenderMode = "preview",
): T {
  const variable = lookupBoundVariable(obj, variables);
  if (!variable) return obj;
  const props = (obj as { props?: { content?: unknown } }).props;
  if (!props || typeof props.content !== "string") return obj;
  const resolved = resolveVariableValue(variable, active, mode);
  if (props.content === resolved) return obj;
  // The discriminated union doesn't narrow through a spread, so we cast
  // back to T. Runtime shape preserves the original variant; only
  // `props.content` changes.
  return {
    ...obj,
    props: { ...props, content: resolved },
  } as unknown as T;
}
