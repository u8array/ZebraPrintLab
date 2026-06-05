import type { LabelObject } from "../types/Group";
import type { CsvMapping, Variable } from "../types/Variable";
import { hasTemplateMarkers, resolveTemplateMarkers } from "./fnTemplate";
import { hasClockMarkers, resolveClockMarkers } from "./fcTemplate";

/** Read `props.content` if present and string-typed; one place for the
 *  unsafe cast that consumers walking heterogeneous trees share. */
export function getObjectStringContent(obj: LabelObject): string | undefined {
  const c = (obj as { props?: { content?: unknown } }).props?.content;
  return typeof c === "string" ? c : undefined;
}

/** Bound Variable, or undefined when unbound or orphan. */
export function lookupBoundVariable(
  obj: LabelObject,
  variables: readonly Variable[],
): Variable | undefined {
  if (!obj.variableId) return undefined;
  return variables.find((v) => v.id === obj.variableId);
}

/** `preview` = actual print value, `schema` = `«name»` placeholder. */
export type RenderMode = "preview" | "schema";

/** Empty CSV cells render as empty (no defaultValue fallback). */
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

export type VariableSource = "csv" | "orphan" | "default";

/** csv=bound to existing header, orphan=bound to missing header, default=unbound. */
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

/** False when: no CSV, schema mode, unbound, or orphan. */
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

/** Recurse leaves through applyBindingToObject; preserves group structure. */
export function applyBindingToTree<T extends LabelObject>(
  objects: readonly T[],
  variables: readonly Variable[],
  active: ActiveCsvRow | null,
  mode: RenderMode = "preview",
  /** Shared clock reference so every leaf sees the same instant. */
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

export interface ActiveCsvRow {
  headers: readonly string[];
  row: readonly string[];
  mapping: CsvMapping;
}

/** Null when no dataset, no mapping, or active index out of bounds. */
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

/** Identity-preserving: returns same ref when unbound or unchanged. */
export function applyBindingToObject<T extends LabelObject>(
  obj: T,
  variables: readonly Variable[],
  active: ActiveCsvRow | null = null,
  mode: RenderMode = "preview",
  /** Lazy-initialised inside the clock branch. */
  now?: Date,
): T {
  const content = getObjectStringContent(obj);
  if (content === undefined) return obj;

  // 1) variableId single-bind, then 2) «name» template substitution so
  // a single-bind value containing markers still resolves.
  let next = content;
  const variable = lookupBoundVariable(obj, variables);
  if (variable) {
    next = resolveVariableValue(variable, active, mode);
  }
  if (hasTemplateMarkers(next)) {
    // O(N+V) vs O(N*V).
    const byName = new Map(variables.map((v) => [v.name, v]));
    next = resolveTemplateMarkers(next, (name) => {
      const v = byName.get(name);
      return v ? resolveVariableValue(v, active, mode) : undefined;
    });
  }
  if (mode === "preview" && hasClockMarkers(next)) {
    next = resolveClockMarkers(next, now ?? new Date());
  }
  if (next === content) return obj;
  const props = (obj as { props: object }).props;
  return {
    ...obj,
    props: { ...props, content: next },
  } as unknown as T;
}
