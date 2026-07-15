import type { LabelObject } from "../types/Group";
import { markerOf, type CsvMapping, type Variable } from "../types/Variable";
import { resolveTemplateMarkers } from "./fnTemplate";
import { channelDatesFrom, hasClockMarkers, resolveClockMarkers } from "./fcTemplate";
import { clockDatesThunk, resolveMarkerChain, type ClockResolveCtx } from "./markerResolve";

// Chain internals live in markerResolve (a leaf module): this module sits in
// the registry's own init chain (typedContent/preflight/variableField import
// it), so it must never import the registry back. Capability flags therefore
// arrive as caller params (see `ctrlOk` / `isCtrlOk`).
export { clockCtxFromLabel, resolveContentPreview, type ClockResolveCtx } from "./markerResolve";

/** Read `props.content` if present and string-typed; one place for the
 *  unsafe cast that consumers walking heterogeneous trees share. */
export function getObjectStringContent(obj: LabelObject): string | undefined {
  const c = (obj as { props?: { content?: unknown } }).props?.content;
  return typeof c === "string" ? c : undefined;
}

/** `preview` = actual print value, `schema` = `«name»` placeholder. */
export type RenderMode = "preview" | "schema";

/** Empty CSV cells render as empty (no defaultValue fallback). */
export function resolveVariableValue(
  variable: Variable,
  active: ActiveCsvRow | null,
  mode: RenderMode = "preview",
): string {
  if (mode === "schema") return markerOf(variable.name);
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
  /** Shared clock context so every leaf sees the same instant and the
   *  same label-level ^SO offsets. */
  clock?: ClockResolveCtx,
  /** Per-leaf control-chip capability (`objectResolvesCtrl`); see
   *  applyBindingToObject. */
  isCtrlOk?: (obj: LabelObject) => boolean,
): T[] {
  // Lift once per tree so all leaves share one instant + offsets.
  const now = clock?.now ?? new Date();
  const dates = clock?.dates ?? channelDatesFrom(
    now,
    clock?.secondaryOffset,
    clock?.tertiaryOffset,
  );
  const shared: ClockResolveCtx = { dates };
  return objects.map((o) => {
    const asGroup = o as unknown as { type?: string; children?: readonly T[] };
    if (asGroup.type === "group" && Array.isArray(asGroup.children)) {
      const nextChildren = applyBindingToTree(asGroup.children, variables, active, mode, shared, isCtrlOk);
      return { ...o, children: nextChildren } as T;
    }
    return applyBindingToObject(o, variables, active, mode, shared, isCtrlOk?.(o) ?? false);
  });
}

export interface ActiveCsvRow {
  headers: readonly string[];
  row: readonly string[];
  mapping: CsvMapping;
}

/** CSV column a variable is bound to, or -1 when unbound / the header is
 *  missing from the dataset. The one place for the binding→column lookup. */
export function boundColumnIndex(
  variable: Pick<Variable, "id">,
  csvDataset: { headers: readonly string[] } | null,
  csvMapping: Pick<CsvMapping, "bindings"> | null,
): number {
  const header = csvMapping?.bindings[variable.id];
  if (header === undefined || !csvDataset) return -1;
  return csvDataset.headers.indexOf(header);
}

/** Print-time resolution of `raw` for a specific CSV row: clock markers via
 *  the primary clock at `now` (offsets shift real dates, never width or
 *  validity), variable markers via the row's bound cell (an empty cell prints
 *  empty) or the default when unbound / `rowIdx < 0`. Unknown markers stay
 *  literal. */
export function resolveForRow(
  raw: string,
  rowIdx: number,
  variables: readonly Variable[],
  csvDataset: { headers: readonly string[]; rows: readonly (readonly string[])[] } | null,
  csvMapping: CsvMapping | null,
  now: Date = new Date(),
): string {
  let next = raw;
  if (hasClockMarkers(next)) {
    next = resolveClockMarkers(next, channelDatesFrom(now, undefined, undefined));
  }
  const byName = new Map(variables.map((v) => [v.name, v]));
  return resolveTemplateMarkers(next, (name) => {
    const v = byName.get(name);
    if (!v) return undefined;
    if (rowIdx >= 0 && csvDataset) {
      const col = boundColumnIndex(v, csvDataset, csvMapping);
      if (col >= 0) return csvDataset.rows[rowIdx]?.[col] ?? "";
    }
    return v.defaultValue;
  });
}

/** Every value a variable's marker can substitute at print time: its default
 *  plus, when bound, all cells of its CSV column. One tested place for the
 *  column-lookup/row-walk that validation consumers share. */
export function variableSubstitutions(
  variable: Variable,
  csvDataset: { headers: readonly string[]; rows: readonly (readonly string[])[] } | null,
  csvMapping: CsvMapping | null,
): string[] {
  const out = [variable.defaultValue];
  const col = boundColumnIndex(variable, csvDataset, csvMapping);
  if (col === -1 || !csvDataset) return out;
  for (const row of csvDataset.rows) {
    // An empty cell prints as empty (no default fallback), so it IS a
    // substitution; a short row's missing cell prints empty too.
    out.push(row[col] ?? "");
  }
  return out;
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
  clock?: ClockResolveCtx,
  /** Emitter parity for control chips (`objectResolvesCtrl(obj)`); default
   *  false keeps a chip literal, matching export on incapable types. */
  ctrlOk = false,
): T {
  const content = getObjectStringContent(obj);
  if (content === undefined) return obj;

  // Content is the only source: `«name»` markers (single known marker is the
  // derived single-bind, others are templates) resolve to the variable value,
  // exactly as `fdFieldFor`/`classifyField` decide on export, so preview and
  // export can never diverge. Clock/control resolve in preview mode only
  // (export emits ^FC / ^FH itself).
  const byName = new Map(variables.map((v) => [v.name, v]));
  const next = resolveMarkerChain(
    content,
    (name) => {
      const v = byName.get(name);
      return v ? resolveVariableValue(v, active, mode) : undefined;
    },
    mode === "preview" ? clockDatesThunk(clock) : null,
    ctrlOk,
  );
  if (next === content) return obj;
  const props = (obj as { props: object }).props;
  return {
    ...obj,
    props: { ...props, content: next },
  } as unknown as T;
}
