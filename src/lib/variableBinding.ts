import type { LabelObject } from "../types/Group";
import type { CsvMapping, Variable } from "../types/Variable";
import { hasTemplateMarkers, resolveTemplateMarkers } from "./fnTemplate";
import { hasClockMarkers, resolveClockMarkers } from "./fcTemplate";

/**
 * Safely read an object's `props.content` as a string. Bindable
 * leaves expose `content`; groups and non-bindable leaves don't.
 * The union doesn't narrow through `as LabelObject`, so this
 * encapsulates the unsafe cast in one place — all consumers that
 * walk a heterogeneous object tree (binding resolution, generator
 * pre-scan, store rename ripple, Variables panel counts) share
 * the same shape check.
 */
export function getObjectStringContent(obj: LabelObject): string | undefined {
  const c = (obj as { props?: { content?: unknown } }).props?.content;
  return typeof c === "string" ? c : undefined;
}

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

/** Whether a Konva-rendered bound object should be marked as
 *  rendering fallback data (not from CSV). Encapsulates the render-
 *  mode + dataset-presence + source-classification rule so the canvas
 *  component stays a thin dispatcher and the rule is testable
 *  without React/Konva.
 *
 *  Returns false when: no CSV is loaded, mode is `schema` (which
 *  already shows «name» — fallback isn't ambiguous), the object
 *  isn't variable-bound, or the resolved variable doesn't exist
 *  (orphan variableId — handled upstream). */
export function shouldShowFallbackTint(
  variable: Variable | undefined,
  csvDataset: { headers: readonly string[] } | null,
  csvMapping: CsvMapping | null,
  mode: RenderMode,
): boolean {
  if (mode !== "preview") return false;
  if (!csvDataset) return false;
  if (!variable) return false;
  return getVariableSource(variable, csvDataset, csvMapping) !== "csv";
}

/** Recurse through a tree of objects and apply `applyBindingToObject`
 *  to every leaf. Group structure is preserved. Used by ZPL
 *  consumers (Labelary preview, generic flat-ZPL emit) that need the
 *  values substituted before generation — `applyBindingToObject`
 *  alone only handles a single node, and a group's children stay
 *  untouched otherwise. */
export function applyBindingToTree<T extends LabelObject>(
  objects: readonly T[],
  variables: readonly Variable[],
  active: ActiveCsvRow | null,
  mode: RenderMode = "preview",
  /** Reference time for clock markers — evaluated once per tree pass
   *  here so every leaf sees the same instant, even on large labels. */
  now?: Date,
): T[] {
  const sharedNow = now ?? new Date();
  return objects.map((o) => {
    const asGroup = o as unknown as { type?: string; children?: readonly T[] };
    if (asGroup.type === "group" && Array.isArray(asGroup.children)) {
      const nextChildren = applyBindingToTree(asGroup.children, variables, active, mode, sharedNow);
      return { ...o, children: nextChildren } as T;
    }
    return applyBindingToObject(o, variables, active, mode, sharedNow);
  });
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
  /** Reference time for `«clock:T»` resolution. Lazy-initialised
   *  inside the clock branch so plain-text fields don't pay for an
   *  unused `new Date()` allocation on every render. */
  now?: Date,
): T {
  const content = getObjectStringContent(obj);
  if (content === undefined) return obj;

  // Two resolution paths, applied in order so they compose:
  //   1. `variableId` single-bind: whole content is the variable value
  //   2. `«name»` template markers (^FE/^FN inline embeds): scan-and-
  //       substitute, multiple variables per content
  // Order matters when a single-bind variable's resolved value itself
  // contains template markers — rare but cheap to support correctly.
  let next = content;
  const variable = lookupBoundVariable(obj, variables);
  if (variable) {
    next = resolveVariableValue(variable, active, mode);
  }
  if (hasTemplateMarkers(next)) {
    // Map lookup so a field with N markers stays O(N+V) not O(N·V).
    const byName = new Map(variables.map((v) => [v.name, v]));
    next = resolveTemplateMarkers(next, (name) => {
      const v = byName.get(name);
      return v ? resolveVariableValue(v, active, mode) : undefined;
    });
  }
  // ^FC clock markers resolve to the editor's current Date so the
  // canvas previews what the printer would substitute right now.
  // Schema mode leaves them as `«clock:T»` literals — same intent
  // as schema-mode variable placeholders (show structure, not data).
  if (mode === "preview" && hasClockMarkers(next)) {
    next = resolveClockMarkers(next, now ?? new Date());
  }
  if (next === content) return obj;
  // Discriminated union doesn't narrow through spread, cast back to T.
  const props = (obj as { props: object }).props;
  return {
    ...obj,
    props: { ...props, content: next },
  } as unknown as T;
}
