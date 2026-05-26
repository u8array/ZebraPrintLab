import { create, useStore } from 'zustand';
import { temporal } from 'zundo';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { LabelConfig, ObjectChanges } from '../types/ObjectType';
import type { Unit } from '../lib/units';
import type { ViewRotation } from '../components/Canvas/rotationGeometry';
import { ObjectRegistry } from '../registry';
import {
  isGroup,
  mapObjectById,
  detachObjectById,
  findObjectById,
  findAncestors,
  isSelfOrDescendant,
  stripVariableIdFromObjects,
  type GroupObject,
  type LabelObject,
  type Page,
} from '../types/Group';
import { locales } from '../locales';
import type { LocaleCode } from '../locales';
import { renameTemplateMarker } from '../lib/fnTemplate';
import { getObjectStringContent } from '../lib/variableBinding';
import { isDefaultLabelaryHost, fetchPreview, labelaryErrorMessage } from '../lib/labelary';
import {
  nextFreeFnNumber,
  FN_NUMBER_MIN,
  FN_NUMBER_MAX,
  type Variable,
  type VariableInput,
  type CsvMapping,
} from '../types/Variable';
import { forgetImport, type CsvParseResult } from '../lib/csvImport';
import { buildActiveCsvRow } from '../lib/variableBinding';
import { buildPreviewZpl } from '../lib/printPreview';

/** Snapshot of an imported CSV plus the row the canvas is currently
 *  previewing. Distinct from the Variable→header mapping (which lives
 *  in the design file): this struct is the data itself, transient. */
export interface CsvDataset {
  headers: string[];
  rows: string[][];
  source: CsvParseResult['source'];
  /** Index into `rows`. Clamped to [0, rows.length - 1] by setters.
   *  Meaningless when `rows.length === 0`, callers should guard. */
  activeRowIndex: number;
}

export type { ObjectChanges };
export type { Variable, VariableInput };

/** Meta fields that remain editable on a locked object so the user can
 *  release the lock or annotate without unlocking first. Everything else
 *  (position, props, rotation, positionType) is blocked. */
const LOCK_BYPASS_KEYS = new Set(['locked', 'visible', 'includeInExport', 'comment', 'name']);

function isLockBypass(changes: ObjectChanges): boolean {
  const keys = Object.keys(changes);
  return keys.length > 0 && keys.every((k) => LOCK_BYPASS_KEYS.has(k));
}

/** Apply `renameTemplateMarker` to every leaf's `content` in a subtree.
 *  Identity-preserving: returns the same array (and same node refs)
 *  when no markers needed rewriting, so React memoisation downstream
 *  stays effective for the common case where the rename touched no
 *  templates. */
function rewriteTemplateMarkers(
  objects: LabelObject[],
  oldName: string,
  newName: string,
): LabelObject[] {
  let changed = false;
  const next = objects.map((obj) => {
    if (isGroup(obj)) {
      const nextChildren = rewriteTemplateMarkers(obj.children, oldName, newName);
      if (nextChildren === obj.children) return obj;
      changed = true;
      return { ...obj, children: nextChildren };
    }
    const content = getObjectStringContent(obj);
    if (content === undefined) return obj;
    const renamed = renameTemplateMarker(content, oldName, newName);
    if (renamed === content) return obj;
    changed = true;
    const props = (obj as { props: object }).props;
    return { ...obj, props: { ...props, content: renamed } } as LabelObject;
  });
  return changed ? next : objects;
}

function applyObjectChanges(
  obj: LabelObject,
  changes: ObjectChanges,
  ancestorLocked = false,
): LabelObject {
  // Lock cascades from any ancestor group: a leaf inside a locked group
  // accepts only bypass keys (locked / visible / includeInExport /
  // comment / name) so the user can still toggle visibility or release
  // the lock from the layers panel. Load-bearing — `expandSelection`-
  // driven callers (arrow-key nudges, shift-multi-drag) target the
  // group's leaf children directly and would otherwise sidestep the
  // group's own `locked` flag.
  if ((obj.locked || ancestorLocked) && !isLockBypass(changes)) return obj;
  if (isGroup(obj)) {
    // Groups have no registry entry (no normalize hook) and no props to
    // merge — apply top-level changes only. Children stay untouched;
    // tree updates reach them through their own mapObjectById call.
    return { ...obj, ...changes } as LabelObject;
  }
  const normalize = ObjectRegistry[obj.type]?.normalizeChanges;
  const normalized = normalize ? normalize(obj, changes) : changes;
  return {
    ...obj,
    ...normalized,
    props: normalized.props ? Object.assign({}, obj.props, normalized.props) : obj.props,
  } as LabelObject;
}

/** Immutable insert-at-index that clamps `idx` into the array's bounds.
 *  Used by reparent flows to splice a node into a children list or the
 *  top-level list without crashing on out-of-range indices coming from
 *  ephemeral drag state. */
function insertAt<T>(arr: readonly T[], idx: number, item: T): T[] {
  const clamped = Math.max(0, Math.min(idx, arr.length));
  return [...arr.slice(0, clamped), item, ...arr.slice(clamped)];
}

function detectLocale(): LocaleCode {
  const lang = navigator.language.slice(0, 2).toLowerCase();
  return (lang in locales ? lang : 'en') as LocaleCode;
}

function detectInitialTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Build-time defaults for third-party services. Vite injects VITE_THIRD_PARTY_*
 *  env values; missing values fall back to enabled. Tauri/Docker builds can flip
 *  the default by setting VITE_THIRD_PARTY_LABELARY=false in their build env. */
function thirdPartyDefaults(): { labelary: boolean } {
  return {
    labelary: import.meta.env.VITE_THIRD_PARTY_LABELARY !== 'false',
  };
}

export interface CanvasSettings {
  showGrid: boolean;
  snapEnabled: boolean;
  snapSizeMm: number;
  zoom: number;
  unit: Unit;
  viewRotation: ViewRotation;
  /** Controls how bound variables render on the canvas.
   *  - 'preview': substitute the active CSV row's cell (falls back to
   *    defaultValue when no row data is available for the variable).
   *  - 'schema': render the placeholder `«variableName»` so the user
   *    sees the field structure regardless of data.
   *  Only meaningful while a `csvDataset` is loaded; the toolbar
   *  toggle is hidden otherwise. */
  csvRenderMode: 'preview' | 'schema';
}

export type ThemePreference = 'light' | 'dark';

/** Labelary-backed canvas overlay. While `active`, the canvas renders
 *  the Labelary-rendered PNG in place of the editor objects so the user
 *  can A/B compare design vs. printed output at the same scale. The
 *  fetch happens on entry and the snapshot is frozen for the lifetime
 *  of the active session — no live refresh — because the comparison
 *  loses meaning if the underlying design shifts under it. */
export type PreviewMode =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'active'; url: string }
  | { status: 'error'; error: string };

interface LabelState {
  label: LabelConfig;
  pages: Page[];
  currentPageIndex: number;
  selectedIds: string[];
  locale: LocaleCode;
  /** UI theme. Initial value seeded from prefers-color-scheme; once toggled
   *  the explicit choice persists. */
  theme: ThemePreference;
  canvasSettings: CanvasSettings;
  /** Per-service gates for third-party network calls. Sourced from build-time
   *  env on every load (see thirdPartyDefaults) and intentionally not in
   *  partialize — until a settings UI lets users explicitly opt in/out, the
   *  build is authoritative. */
  thirdParty: { labelary: boolean };
  /** Whether the user has dismissed the one-time Labelary privacy notice. */
  labelaryNoticeAcknowledged: boolean;

  /** State of the Labelary canvas overlay. `idle` is the editor default;
   *  `loading`/`active`/`error` mean the comparison overlay is in play and
   *  editor surfaces should be visually locked. */
  previewMode: PreviewMode;

  clipboard: LabelObject[];
  pasteCount: number;

  /** Document-level template variables. Fields reference them via
   *  `variableId`; export emits `^FN{fnNumber}^FD{defaultValue}^FS`.
   *  Order is user-controlled and surfaces in the Variables panel. */
  variables: Variable[];

  /** Session-only CSV data feeding the template variables. Holds the
   *  most-recently-imported file's headers + rows plus the
   *  active-row index the canvas previews. Intentionally NOT in
   *  persist-partialize: the file path can't be reopened on rehydrate,
   *  and persisting raw rows would bloat localStorage and leak
   *  customer data into the design file. User re-imports per session.
   *  Mapping (which variable maps to which header) lives separately
   *  in `csvMapping` and round-trips with the design. */
  csvDataset: CsvDataset | null;

  /** Persistent mapping between Variables and CSV column names.
   *  Lives in the design file (round-tripped via Save/Load) so a
   *  user can re-import the same CSV structure later without
   *  re-mapping. Null when no CSV has ever been imported into this
   *  design. */
  csvMapping: CsvMapping | null;

  addObject: (
    type: string,
    position?: { x: number; y: number },
    propsOverride?: object,
  ) => void;
  updateObject: (id: string, changes: ObjectChanges) => void;
  updateObjects: (updates: { id: string; changes: ObjectChanges }[]) => void;
  removeObject: (id: string) => void;
  duplicateObject: (id: string) => void;
  duplicateSelectedObjects: () => void;
  copySelectedObjects: () => void;
  pasteObjects: () => void;
  selectObject: (id: string | null) => void;
  toggleSelectObject: (id: string) => void;
  selectObjects: (ids: string[]) => void;
  removeSelectedObjects: () => void;
  /** Wraps every selected top-level, unlocked object in a new GroupObject
   *  at the position of the topmost (last-in-array) selected item.
   *  No-op if fewer than one such object is selected. */
  groupSelection: () => void;
  /** Replaces every selected top-level group with its children, splicing
   *  them in at the group's former index. No-op on non-group selections. */
  ungroup: () => void;
  /** Like `ungroup`, but operates on an explicit id list instead of the
   *  active selection. Used by the layers panel's per-row ungroup
   *  button so the user doesn't have to select the group first. */
  ungroupIds: (ids: readonly string[]) => void;
  /** Move `id` to a new position in the tree. `parentId: null` means the
   *  top level; any other value targets a group. `index` is the
   *  insertion position inside the target's children list. Silently
   *  refuses cycles (moving a group into its own descendant). */
  reparentObject: (id: string, target: { parentId: string | null; index: number }) => void;
  /** Append an empty group at the top level (end of the objects array =
   *  front-most layer = topmost row in the layers panel) and select it.
   *  Lets the user create a group up-front and drag items in afterwards
   *  via the layers panel, instead of having to select-then-shortcut. */
  addGroup: () => void;
  setLabelConfig: (config: Partial<LabelConfig>) => void;
  setLocale: (locale: LocaleCode) => void;
  setTheme: (theme: ThemePreference) => void;
  setThirdPartyEnabled: (service: 'labelary', enabled: boolean) => void;
  acknowledgeLabelaryNotice: () => void;
  setCanvasSettings: (settings: Partial<CanvasSettings>) => void;
  loadDesign: (
    label: LabelConfig,
    pages: Page[],
    variables?: Variable[],
    csvMapping?: CsvMapping | null,
  ) => void;
  appendPages: (pages: Page[]) => void;

  /** Create a new variable. Returns the new id, or null when all 99
   *  `^FN` slots are taken (or the supplied fnNumber is out of range /
   *  already used). Callers should surface null to the user. */
  addVariable: (input: VariableInput) => string | null;
  /** Patch fields on an existing variable. Validates uniqueness of
   *  `name` and `fnNumber` and clamps `fnNumber` to [1, 99]; rejects
   *  silently (no-op) on conflict so callers don't have to handle errors
   *  for every keystroke. */
  updateVariable: (id: string, changes: Partial<Omit<Variable, 'id'>>) => void;
  /** Delete a variable and unbind every field that referenced it across
   *  every page. The field's own content prop (kept since binding) takes
   *  over on render/export. */
  removeVariable: (id: string) => void;
  /** Bulk-replace the entire variables list. Used by the mapping
   *  modal's Apply path so add-variable-inline can commit atomically
   *  with the new mapping. No cleanup of bindings or fields: callers
   *  are expected to only append (every existing id stays in the
   *  array); removals still go through `removeVariable` for the
   *  full strip-and-unbind dance. */
  setVariables: (variables: Variable[]) => void;

  /** Replace the entire CSV dataset and reset the active row to 0. */
  loadCsv: (result: CsvParseResult) => void;
  /** Drop the current CSV dataset (session-only data). Does not touch
   *  `csvMapping`; the mapping persists in the design so the next CSV
   *  with the same headers reuses it silently. */
  clearCsv: () => void;
  /** Move the canvas preview to a different row. Out-of-range indices
   *  are silently clamped to [0, rows.length - 1]; no-op when no CSV
   *  is loaded. */
  setActiveRow: (index: number) => void;
  /** Set or replace the CSV mapping on the current design. Passing
   *  null clears the mapping (e.g. user picks "Reset mapping"). */
  setCsvMapping: (mapping: CsvMapping | null) => void;

  /** Atomic commit for the mapping-modal Apply path: updates
   *  variables, dataset, mapping and active row in a single store
   *  mutation so zundo records one undo step (instead of four) and
   *  no intermediate state ever leaks. */
  applyMappingDraft: (input: {
    variables: Variable[];
    dataset: CsvParseResult;
    mapping: CsvMapping;
    activeRowIndex: number;
  }) => void;

  /** Whether the CSV mapping modal is currently open. Lives in the
   *  store so the auto-open trigger (after import, on header
   *  mismatch) and the manual-open trigger (button in Variables
   *  panel) can share one flag without prop drilling. */
  csvMappingModalOpen: boolean;
  openCsvMappingModal: () => void;
  closeCsvMappingModal: () => void;
  moveObjectForward: (id: string) => void;
  moveObjectBackward: (id: string) => void;
  moveObjectToFront: (id: string) => void;
  moveObjectToBack: (id: string) => void;
  reorderObject: (id: string, toIndex: number) => void;

  addPage: () => void;
  removePage: (index: number) => void;
  duplicatePage: (index: number) => void;
  setCurrentPage: (index: number) => void;

  /** Right-sidebar tab currently visible. Lives in the store so canvas
   *  interactions (e.g. double-click a text field) can drive the
   *  panel — the sidebar itself reads + writes via `setSidebarTab`. */
  sidebarTab: 'properties' | 'layers' | 'variables' | 'fonts';
  setSidebarTab: (tab: LabelState['sidebarTab']) => void;
  /** One-shot focus request scoped to a single object. Each call sets a
   *  fresh object (incrementing `nonce` so consumers can re-fire even
   *  for the same id) and TemplateContentInput's effect compares its
   *  own `objectId` prop to `id` so only the editor for the requested
   *  object takes focus. `null` is the steady state — kept transient
   *  in memory only, never persisted. */
  editorFocusRequest: { id: string; nonce: number } | null;
  /** Fire a focus request for the given object's content editor. Does
   *  NOT touch the sidebar tab — the caller is responsible for
   *  composing `setSidebarTab('properties')` alongside this when the
   *  request would otherwise land on an unmounted editor. Decoupled
   *  so the store doesn't assert which panel hosts the editor. */
  requestContentEditorFocus: (id: string) => void;

  /** Start a preview session: render the current page's objects to ZPL,
   *  fetch the Labelary PNG, swap status to `active` on success or
   *  `error` on failure. Should only be called when `previewMode.status`
   *  is `idle` or `error` (the toggle button enforces this). */
  enterPreviewMode: () => Promise<void>;
  /** End a preview session: revoke the cached blob URL and reset to
   *  `idle`. Safe to call from any non-`idle` status. */
  exitPreviewMode: () => void;
}

type PageState = Pick<LabelState, 'pages' | 'currentPageIndex'>;

export const currentObjects = (state: PageState): LabelObject[] =>
  state.pages[state.currentPageIndex]?.objects ?? [];

/** True when a Labelary network call is permitted: the gate is on AND the
 *  user has seen the privacy notice. Kept as a documented invariant; UI
 *  buttons read `thirdParty.labelary` and `labelaryNoticeAcknowledged`
 *  separately because they need to distinguish "hide" (gate off) from
 *  "show notice first" (gate on, not yet acknowledged). */
export const canCallLabelary = (s: LabelState): boolean =>
  s.thirdParty.labelary && s.labelaryNoticeAcknowledged;

/** True when clicking a Labelary-backed action must first surface the
 *  privacy notice modal. A custom-host build implies the operator already
 *  controls the endpoint and no third-party disclosure is needed. */
export const selectLabelaryNoticeRequired = (s: LabelState): boolean =>
  isDefaultLabelaryHost() && !s.labelaryNoticeAcknowledged;

/** True while the preview overlay is taking input away from the editor —
 *  i.e. the canvas Stage should not accept pointer events. Loading and
 *  active both qualify (loading blocks edits so the snapshot we're about
 *  to show isn't already stale); error and idle return false so the user
 *  can keep working after dismissing a failure. */
export const selectPreviewLocksEditor = (s: LabelState): boolean =>
  s.previewMode.status === 'loading' || s.previewMode.status === 'active';

/** The dataset + mapping pair that batch emit needs, or null when
 *  batch emit would produce nothing different from a single label.
 *  Requires a loaded CSV with rows and at least one mapped Variable.
 *  Co-narrows the two store fields so callers don't repeat the
 *  null-checks for TS. */
export const selectBatchInputs = (
  s: LabelState,
): { dataset: CsvDataset; mapping: CsvMapping } | null => {
  const { csvDataset, csvMapping } = s;
  if (!csvDataset || csvDataset.rows.length === 0) return null;
  if (!csvMapping || Object.keys(csvMapping.bindings).length === 0) return null;
  return { dataset: csvDataset, mapping: csvMapping };
};

/** Boolean form of {@link selectBatchInputs} — feeds the File menu
 *  enable state without triggering re-renders on the inner refs. */
export const selectCanBatchExport = (s: LabelState): boolean =>
  selectBatchInputs(s) !== null;

function updateCurrentObjects(
  state: PageState,
  fn: (objects: LabelObject[]) => LabelObject[]
): Pick<LabelState, 'pages'> {
  return {
    pages: state.pages.map((p, i) =>
      i === state.currentPageIndex ? { ...p, objects: fn(p.objects) } : p
    ),
  };
}

/** Base offset (in dots) used to stagger duplicate / paste copies so they
 *  don't sit exactly on top of the source. 20 dots ≈ 2.5 mm at 8dpmm —
 *  visible without pushing copies off-canvas. duplicateObject and
 *  duplicateSelectedObjects apply it as a constant (the selection follows
 *  the new copy, so subsequent duplicates stagger naturally); pasteObjects
 *  multiplies it by pasteCount because the clipboard source stays put. */
const DUPLICATE_OFFSET_DOTS = 20;

/** Single-entry cache for the Labelary preview blob URL, keyed by the
 *  exact ZPL string that produced it. Module-level rather than store-
 *  state because the blob URL is a non-serialisable side-effect handle:
 *  persisting it through `partialize` would resurrect a stale identifier
 *  across reloads, and including it in Zustand state would churn every
 *  selector that observes the store.
 *
 *  The closure owns the URL: `set` revokes the previous blob before
 *  replacing it, so callers can't leak by forgetting to clean up. */
const previewCache = (() => {
  let entry: { zpl: string; url: string } | null = null;
  return {
    /** Returns the cached URL if `zpl` matches the cached key, else null. */
    get(zpl: string): string | null {
      return entry && entry.zpl === zpl ? entry.url : null;
    },
    /** Stores a fresh (zpl, url) pair. Revokes the previously held URL
     *  if any so the browser can reclaim the blob memory. */
    set(zpl: string, url: string): void {
      if (entry) URL.revokeObjectURL(entry.url);
      entry = { zpl, url };
    },
    /** Test-only: drop the cached entry without revoking, so a fresh
     *  test starts from a clean slate. Production callers should never
     *  need this — `set` handles eviction on its own. */
    _resetForTests(): void {
      entry = null;
    },
  };
})();

/** Test-only handle to clear the preview cache between test cases.
 *  Marked underscored to discourage production use; the cache otherwise
 *  manages its own lifecycle via the `set` revoke path. */
export const __resetPreviewCacheForTests = (): void => previewCache._resetForTests();

/** Build offset copies of objects identified by `ids`. Missing ids are
 *  silently dropped. Props are shallow-cloned to match the pattern in
 *  copySelectedObjects — even though no current code path mutates props,
 *  sharing the reference would be a hidden trap for future contributors. */
function buildOffsetCopies(objs: LabelObject[], ids: readonly string[]): LabelObject[] {
  const byId = new Map(objs.map((o) => [o.id, o]));
  return ids.flatMap((id) => {
    const src = byId.get(id);
    if (!src) return [];
    // Groups don't carry props and need their children's ids regenerated
    // recursively so the duplicate doesn't collide with the original
    // (mapObjectById would otherwise hit the first match and ignore the
    // second). Leaves: shallow-clone props to avoid sharing the
    // reference with future mutators.
    if (isGroup(src)) {
      return [{
        ...src,
        id: crypto.randomUUID(),
        x: src.x + DUPLICATE_OFFSET_DOTS,
        y: src.y + DUPLICATE_OFFSET_DOTS,
        children: cloneChildrenFresh(src.children),
      }];
    }
    return [{
      ...src,
      id: crypto.randomUUID(),
      x: src.x + DUPLICATE_OFFSET_DOTS,
      y: src.y + DUPLICATE_OFFSET_DOTS,
      props: { ...src.props },
    } as LabelObject];
  });
}

/** Deep-clone a children list with fresh ids and shallow-cloned props on
 *  every leaf. Recurses through nested groups. Used by duplicate flows
 *  so a duplicated subtree has no id collisions with the source. */
function cloneChildrenFresh(children: LabelObject[]): LabelObject[] {
  return children.map((c) => {
    if (isGroup(c)) {
      return {
        ...c,
        id: crypto.randomUUID(),
        children: cloneChildrenFresh(c.children),
      };
    }
    return { ...c, id: crypto.randomUUID(), props: { ...c.props } } as LabelObject;
  });
}

export function migrateLegacy(persistedState: unknown, version: number): unknown {
  if (!persistedState || typeof persistedState !== 'object') return persistedState;
  let s = persistedState as Record<string, unknown>;

  // v0→v1: top-level objects array → pages
  if (version < 1 && Array.isArray(s.objects) && !Array.isArray(s.pages)) {
    s = { ...s, pages: [{ objects: s.objects }], currentPageIndex: 0 };
  }

  // v1→v2: viewRotation was added after version 1 shipped; patch it if absent.
  if (version < 2) {
    const cs = s.canvasSettings;
    if (cs && typeof cs === 'object' && !('viewRotation' in cs)) {
      s = { ...s, canvasSettings: { ...(cs as Record<string, unknown>), viewRotation: 0 } };
    }
  }

  // v2→v3: `circle` was folded into `ellipse` with `lockAspect:true`. Old
  // saves still carry `type:'circle'` with `props.diameter`; rewrite them so
  // the rest of the app only ever sees the unified ellipse shape.
  if (version < 3) {
    s = { ...s, pages: migrateCirclesInPages(s.pages) };
  }

  // v3→v4: canvasSettings.csvRenderMode added for the schema/preview toggle.
  // Default to 'preview' so existing sessions keep showing data-substituted
  // canvas exactly as before.
  if (version < 4) {
    const cs = s.canvasSettings;
    if (cs && typeof cs === 'object' && !('csvRenderMode' in cs)) {
      s = { ...s, canvasSettings: { ...(cs as Record<string, unknown>), csvRenderMode: 'preview' } };
    }
  }

  return s;
}

function migrateCirclesInPages(pages: unknown): unknown {
  if (!Array.isArray(pages)) return pages;
  return pages.map((page) => {
    if (!page || typeof page !== 'object') return page;
    const p = page as { objects?: unknown };
    if (!Array.isArray(p.objects)) return page;
    return { ...p, objects: p.objects.map(migrateCircleObject) };
  });
}

function migrateCircleObject(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  const o = obj as { type?: unknown; props?: unknown; children?: unknown };
  if (Array.isArray(o.children)) {
    return { ...o, children: o.children.map(migrateCircleObject) };
  }
  if (o.type !== 'circle' || !o.props || typeof o.props !== 'object') return obj;
  const cp = o.props as { diameter?: number; thickness?: number; filled?: boolean; color?: 'B' | 'W' };
  const d = typeof cp.diameter === 'number' ? cp.diameter : 100;
  return {
    ...o,
    type: 'ellipse',
    props: {
      width: d,
      height: d,
      thickness: typeof cp.thickness === 'number' ? cp.thickness : 3,
      filled: cp.filled === true,
      color: cp.color === 'W' ? 'W' : 'B',
      lockAspect: true,
    },
  };
}

export const useLabelStore = create<LabelState>()(
  temporal(
    persist(
    (set, get) => ({
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      pages: [{ objects: [] }],
      currentPageIndex: 0,
      selectedIds: [],
      clipboard: [],
      pasteCount: 0,
      variables: [],
      csvDataset: null,
      csvMapping: null,
      csvMappingModalOpen: false,
      locale: detectLocale(),
      theme: detectInitialTheme(),
      thirdParty: thirdPartyDefaults(),
      labelaryNoticeAcknowledged: false,
      previewMode: { status: 'idle' },
      canvasSettings: { showGrid: false, snapEnabled: false, snapSizeMm: 1, zoom: 1, unit: 'mm', viewRotation: 0, csvRenderMode: 'preview' },

      addObject: (type, position = { x: 50, y: 50 }, propsOverride) => {
        if (selectPreviewLocksEditor(get())) return;
        const definition = ObjectRegistry[type];
        if (!definition) return;

        const obj = {
          id: crypto.randomUUID(),
          type,
          x: position.x,
          y: position.y,
          rotation: 0,
          props: { ...definition.defaultProps, ...propsOverride },
        } as LabelObject;

        set((state) => ({
          ...updateCurrentObjects(state, (objs) => [...objs, obj]),
          selectedIds: [obj.id],
        }));
      },

      updateObject: (id, changes) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const objs = currentObjects(state);
          const ancestorLocked = findAncestors(objs, id).some((g) => !!g.locked);
          return updateCurrentObjects(state, (curr) =>
            mapObjectById(curr, id, (obj) =>
              applyObjectChanges(obj, changes, ancestorLocked),
            ),
          );
        }),

      updateObjects: (updates) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          if (updates.length === 0) return {};
          // Single tree walk that applies every queued change in one
          // pass: O(tree) instead of O(updates × tree). Identity-
          // preserving — subtrees with no matching id keep their
          // reference so React memoisation can skip them. The walk
          // carries inheritedLocked so a leaf inside a locked group
          // sees the cascade without each call re-traversing ancestors.
          const updateMap = new Map(updates.map((u) => [u.id, u.changes]));
          const applyUpdates = (
            nodes: LabelObject[],
            inheritedLocked: boolean,
          ): LabelObject[] => {
            let changed = false;
            const next = nodes.map((n) => {
              const changes = updateMap.get(n.id);
              let updated = changes
                ? applyObjectChanges(n, changes, inheritedLocked)
                : n;
              if (isGroup(updated)) {
                const childLocked = inheritedLocked || !!updated.locked;
                const nextChildren = applyUpdates(updated.children, childLocked);
                if (nextChildren !== updated.children) {
                  updated = { ...updated, children: nextChildren };
                }
              }
              if (updated !== n) changed = true;
              return updated;
            });
            return changed ? next : nodes;
          };
          return updateCurrentObjects(state, (objs) => applyUpdates(objs, false));
        }),

      removeObject: (id) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const obj = currentObjects(state).find((o) => o.id === id);
          if (obj?.locked) return {};
          return {
            ...updateCurrentObjects(state, (objs) => objs.filter((o) => o.id !== id)),
            selectedIds: state.selectedIds.filter((s) => s !== id),
          };
        }),

      duplicateObject: (id) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const copies = buildOffsetCopies(currentObjects(state), [id]);
          if (copies.length === 0) return {};
          return {
            ...updateCurrentObjects(state, (curr) => [...curr, ...copies]),
            selectedIds: copies.map((c) => c.id),
          };
        }),

      duplicateSelectedObjects: () =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          if (state.selectedIds.length === 0) return {};
          const copies = buildOffsetCopies(currentObjects(state), state.selectedIds);
          return {
            ...updateCurrentObjects(state, (curr) => [...curr, ...copies]),
            selectedIds: copies.map((c) => c.id),
          };
        }),

      copySelectedObjects: () => {
        const state = get();
        // Copy doesn't mutate the design, but the clipboard write would
        // create a confusing "I copied something during preview" state.
        if (selectPreviewLocksEditor(state)) return;
        const objs = currentObjects(state);
        const clipboard = state.selectedIds.flatMap((id) => {
          const obj = objs.find((o) => o.id === id);
          if (!obj) return [];
          if (isGroup(obj)) {
            // Clone children too so a later paste produces an
            // independent subtree (paste regenerates the top-level id
            // but expects descendants ready to be inserted as-is).
            return [{ ...obj, children: cloneChildrenFresh(obj.children) }];
          }
          return [{ ...obj, props: { ...obj.props } } as LabelObject];
        });
        set({ clipboard, pasteCount: 0 });
      },

      pasteObjects: () =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          if (state.clipboard.length === 0) return {};
          const pasteCount = state.pasteCount + 1;
          const offset = pasteCount * DUPLICATE_OFFSET_DOTS;
          const copies: LabelObject[] = state.clipboard.map((src) => ({
            ...src,
            id: crypto.randomUUID(),
            x: src.x + offset,
            y: src.y + offset,
          } as LabelObject));
          return {
            ...updateCurrentObjects(state, (curr) => [...curr, ...copies]),
            selectedIds: copies.map((c) => c.id),
            pasteCount,
          };
        }),

      selectObject: (id) =>
        set((state) => {
          const next = id ? [id] : [];
          const same =
            state.selectedIds.length === next.length &&
            state.selectedIds[0] === next[0];
          if (same) return {};
          return { selectedIds: next };
        }),

      toggleSelectObject: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((s) => s !== id)
            : [...state.selectedIds, id],
        })),

      selectObjects: (ids) =>
        set((state) => {
          const same =
            state.selectedIds.length === ids.length &&
            state.selectedIds.every((id, i) => id === ids[i]);
          if (same) return {};
          return { selectedIds: ids };
        }),

      removeSelectedObjects: () =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const sel = new Set(state.selectedIds);
          const objs = currentObjects(state);
          // Locked objects survive a Delete keystroke / bulk-remove; the
          // multi-select clears down to whichever locked items remain.
          const lockedIds = objs.flatMap((o) => sel.has(o.id) && o.locked ? [o.id] : []);
          return {
            ...updateCurrentObjects(state, (curr) =>
              curr.filter((o) => !sel.has(o.id) || o.locked),
            ),
            selectedIds: lockedIds,
          };
        }),

      groupSelection: () =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const objs = currentObjects(state);
          const sel = new Set(state.selectedIds);
          // Only consider top-level objects of the current page. Nested
          // children of an existing group are out of scope for v1 — the
          // user would have to ungroup the parent first.
          const candidates = objs.flatMap((o) =>
            sel.has(o.id) && !o.locked ? [o] : [],
          );
          if (candidates.length === 0) return {};
          const candidateIds = new Set(candidates.map((o) => o.id));
          // Insert at the position of the last (topmost in z-order)
          // selected item so the group lands where the user's eye is.
          const lastIndex = objs.reduce(
            (acc, o, i) => (candidateIds.has(o.id) ? i : acc),
            -1,
          );
          const group: GroupObject = {
            id: crypto.randomUUID(),
            type: 'group',
            x: 0,
            y: 0,
            rotation: 0,
            children: candidates,
          };
          const remaining = objs.filter((o) => !candidateIds.has(o.id));
          // lastIndex is computed on the pre-filter array; convert it to
          // the post-filter insertion point by counting how many of the
          // removed items were before it.
          const removedBefore = objs
            .slice(0, lastIndex + 1)
            .filter((o) => candidateIds.has(o.id)).length;
          const insertAt = lastIndex + 1 - removedBefore;
          const next = [
            ...remaining.slice(0, insertAt),
            group,
            ...remaining.slice(insertAt),
          ];
          return {
            ...updateCurrentObjects(state, () => next),
            selectedIds: [group.id],
          };
        }),

      reparentObject: (id, target) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const objs = currentObjects(state);
          // Forbid cycles: moving a group into itself or one of its
          // descendants would orphan the rest of the tree.
          if (target.parentId && isSelfOrDescendant(objs, id, target.parentId)) {
            return {};
          }
          // Refuse drops into something that isn't a group — the layers
          // panel should never produce this, but a defensive check
          // keeps the model from picking up bogus state if a caller
          // passes a leaf id.
          if (target.parentId !== null) {
            const parent = findObjectById(objs, target.parentId);
            if (!parent || !isGroup(parent)) return {};
          }
          const { removed, rest } = detachObjectById(objs, id);
          if (!removed) return {};
          const node = removed;
          if (target.parentId === null) {
            return updateCurrentObjects(state, () => insertAt(rest, target.index, node));
          }
          const next = mapObjectById(rest, target.parentId, (p) =>
            isGroup(p)
              ? { ...p, children: insertAt(p.children, target.index, node) }
              : p,
          );
          return updateCurrentObjects(state, () => next);
        }),

      addGroup: () =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const group: GroupObject = {
            id: crypto.randomUUID(),
            type: 'group',
            x: 0,
            y: 0,
            rotation: 0,
            children: [],
          };
          return {
            ...updateCurrentObjects(state, (objs) => [...objs, group]),
            selectedIds: [group.id],
          };
        }),

      ungroup: () => get().ungroupIds(get().selectedIds),

      ungroupIds: (ids) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const wanted = new Set(ids);
          const objs = currentObjects(state);
          const targets = objs.flatMap((o) =>
            wanted.has(o.id) && isGroup(o) && !o.locked ? [o] : [],
          );
          if (targets.length === 0) return {};
          const targetIds = new Set(targets.map((g) => g.id));
          const next: LabelObject[] = [];
          const newSelection: string[] = [];
          for (const o of objs) {
            if (targetIds.has(o.id) && isGroup(o)) {
              next.push(...o.children);
              newSelection.push(...o.children.map((c) => c.id));
            } else {
              next.push(o);
            }
          }
          return {
            ...updateCurrentObjects(state, () => next),
            selectedIds: newSelection,
          };
        }),

      moveObjectToFront: (id) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const objs = currentObjects(state);
          const idx = objs.findIndex((o) => o.id === id);
          if (idx === -1 || idx === objs.length - 1) return {};
          return updateCurrentObjects(state, (curr) => {
            const next = [...curr];
            const [moved] = next.splice(idx, 1);
            if (moved) next.push(moved);
            return next;
          });
        }),

      moveObjectToBack: (id) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const objs = currentObjects(state);
          const idx = objs.findIndex((o) => o.id === id);
          if (idx <= 0) return {};
          return updateCurrentObjects(state, (curr) => {
            const next = [...curr];
            const [moved] = next.splice(idx, 1);
            if (moved) next.unshift(moved);
            return next;
          });
        }),

      moveObjectForward: (id) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const objs = currentObjects(state);
          const idx = objs.findIndex((o) => o.id === id);
          if (idx === -1 || idx === objs.length - 1) return {};
          return updateCurrentObjects(state, (curr) => {
            const next = [...curr];
            const tmp = next[idx + 1] as LabelObject;
            next[idx + 1] = next[idx] as LabelObject;
            next[idx] = tmp;
            return next;
          });
        }),

      moveObjectBackward: (id) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const objs = currentObjects(state);
          const idx = objs.findIndex((o) => o.id === id);
          if (idx <= 0) return {};
          return updateCurrentObjects(state, (curr) => {
            const next = [...curr];
            const tmp = next[idx - 1] as LabelObject;
            next[idx - 1] = next[idx] as LabelObject;
            next[idx] = tmp;
            return next;
          });
        }),

      reorderObject: (id, toIndex) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const objs = currentObjects(state);
          const fromIndex = objs.findIndex((o) => o.id === id);
          if (fromIndex === -1 || fromIndex === toIndex) return {};
          return updateCurrentObjects(state, (curr) => {
            const next = [...curr];
            const [item] = next.splice(fromIndex, 1);
            if (item) next.splice(toIndex, 0, item);
            return next;
          });
        }),

      loadDesign: (label, pages, variables, csvMapping) => {
        if (selectPreviewLocksEditor(get())) return;
        // Drop the prior design's CSV cache too: the raw text in the
        // module cache belongs to that file, not the one being loaded.
        forgetImport();
        set({
          label,
          pages: pages.length > 0 ? pages : [{ objects: [] }],
          currentPageIndex: 0,
          selectedIds: [],
          variables: variables ?? [],
          csvMapping: csvMapping ?? null,
          csvDataset: null,
        });
      },

      // Append-mode counterpart to loadDesign: keeps the current label
      // config (the user opted into the existing design's dimensions /
      // dpmm) and just tacks the imported pages onto the end of the
      // page list, switching focus to the first appended page.
      appendPages: (pages) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          if (pages.length === 0) return {};
          const newPages = [...state.pages, ...pages];
          return {
            pages: newPages,
            currentPageIndex: state.pages.length,
            selectedIds: [],
          };
        }),

      setLabelConfig: (config) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          return { label: { ...state.label, ...config } };
        }),

      setLocale: (locale) => set({ locale }),

      setTheme: (theme) => set({ theme }),

      setThirdPartyEnabled: (service, enabled) =>
        set((state) => ({ thirdParty: { ...state.thirdParty, [service]: enabled } })),

      acknowledgeLabelaryNotice: () => set({ labelaryNoticeAcknowledged: true }),

      setCanvasSettings: (settings) =>
        set((state) => ({ canvasSettings: { ...state.canvasSettings, ...settings } })),

      addPage: () =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const insertAt = state.currentPageIndex + 1;
          const newPages = [
            ...state.pages.slice(0, insertAt),
            { objects: [] },
            ...state.pages.slice(insertAt),
          ];
          return {
            pages: newPages,
            currentPageIndex: insertAt,
            selectedIds: [],
          };
        }),

      removePage: (index) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          if (state.pages.length <= 1) return {};
          if (index < 0 || index >= state.pages.length) return {};
          const newPages = state.pages.filter((_, i) => i !== index);
          let newIndex = state.currentPageIndex;
          if (index < state.currentPageIndex) {
            newIndex = state.currentPageIndex - 1;
          } else if (index === state.currentPageIndex) {
            newIndex = Math.min(state.currentPageIndex, newPages.length - 1);
          }
          return {
            pages: newPages,
            currentPageIndex: newIndex,
            selectedIds: [],
          };
        }),

      duplicatePage: (index) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          if (index < 0 || index >= state.pages.length) return {};
          const source = state.pages[index];
          if (!source) return {};
          const cloned: Page = {
            objects: source.objects.map((o) => {
              if (isGroup(o)) {
                return {
                  ...o,
                  id: crypto.randomUUID(),
                  children: cloneChildrenFresh(o.children),
                };
              }
              return {
                ...o,
                id: crypto.randomUUID(),
                props: { ...o.props },
              } as LabelObject;
            }),
          };
          const insertAt = index + 1;
          const newPages = [
            ...state.pages.slice(0, insertAt),
            cloned,
            ...state.pages.slice(insertAt),
          ];
          return {
            pages: newPages,
            currentPageIndex: insertAt,
            selectedIds: [],
          };
        }),

      setCurrentPage: (index) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          if (index < 0 || index >= state.pages.length) return {};
          if (index === state.currentPageIndex) return {};
          return { currentPageIndex: index, selectedIds: [] };
        }),

      // sidebarTab is transient — not in partialize, so a reload
      // resets it to 'properties' (the safe default for any selection
      // state that survived rehydration).
      sidebarTab: 'properties',
      setSidebarTab: (tab) => set({ sidebarTab: tab }),
      editorFocusRequest: null,
      requestContentEditorFocus: (id) =>
        set((state) => ({
          editorFocusRequest: {
            id,
            nonce: (state.editorFocusRequest?.nonce ?? 0) + 1,
          },
        })),

      addVariable: (input) => {
        const state = get();
        if (selectPreviewLocksEditor(state)) return null;
        const trimmedName = input.name.trim();
        if (trimmedName === '') return null;
        if (state.variables.some((v) => v.name === trimmedName)) return null;

        let fnNumber: number;
        if (input.fnNumber !== undefined) {
          if (input.fnNumber < FN_NUMBER_MIN || input.fnNumber > FN_NUMBER_MAX) return null;
          if (state.variables.some((v) => v.fnNumber === input.fnNumber)) return null;
          fnNumber = input.fnNumber;
        } else {
          const next = nextFreeFnNumber(state.variables.map((v) => v.fnNumber));
          if (next === null) return null;
          fnNumber = next;
        }

        const variable: Variable = {
          id: crypto.randomUUID(),
          name: trimmedName,
          fnNumber,
          defaultValue: input.defaultValue ?? '',
          ...(input.comment !== undefined ? { comment: input.comment } : {}),
        };
        set((s) => ({ variables: [...s.variables, variable] }));
        return variable.id;
      },

      updateVariable: (id, changes) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          const existing = state.variables.find((v) => v.id === id);
          if (!existing) return {};

          if (changes.name !== undefined) {
            const trimmed = changes.name.trim();
            if (trimmed === '') return {};
            if (state.variables.some((v) => v.id !== id && v.name === trimmed)) return {};
            changes = { ...changes, name: trimmed };
          }
          if (changes.fnNumber !== undefined) {
            if (changes.fnNumber < FN_NUMBER_MIN || changes.fnNumber > FN_NUMBER_MAX) return {};
            if (state.variables.some((v) => v.id !== id && v.fnNumber === changes.fnNumber)) return {};
          }

          const next: Partial<typeof state> = {
            variables: state.variables.map((v) => (v.id === id ? { ...v, ...changes } : v)),
          };
          // Rename ripple: when the variable's name changes, every
          // `«oldName»` marker in any object's content needs to point
          // at the new name. Without this the templates dangle (resolve
          // to literal text) and the user has no obvious way to fix
          // them other than re-typing.
          if (changes.name !== undefined && changes.name !== existing.name) {
            const oldName = existing.name;
            const newName = changes.name;
            next.pages = state.pages.map((page) => ({
              ...page,
              objects: rewriteTemplateMarkers(page.objects, oldName, newName),
            }));
          }
          return next;
        }),

      setVariables: (variables) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          // Mirror addVariable's validation. Bulk-replace bypasses
          // per-entry guards so we re-check here; a stray duplicate
          // would leave the Variables panel in an unfixable state
          // (two rows with identical name or slot, neither
          // editable to the other's value).
          const names = new Set<string>();
          const fns = new Set<number>();
          for (const v of variables) {
            const trimmed = v.name.trim();
            if (trimmed === '') return {};
            if (names.has(trimmed)) return {};
            names.add(trimmed);
            if (v.fnNumber < FN_NUMBER_MIN || v.fnNumber > FN_NUMBER_MAX) return {};
            if (fns.has(v.fnNumber)) return {};
            fns.add(v.fnNumber);
          }
          return { variables };
        }),

      removeVariable: (id) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          if (!state.variables.some((v) => v.id === id)) return {};
          let pagesChanged = false;
          const nextPages = state.pages.map((p) => {
            const stripped = stripVariableIdFromObjects(p.objects, id);
            if (stripped === p.objects) return p;
            pagesChanged = true;
            return { ...p, objects: stripped };
          });
          // Mapping-cleanup: drop any csvMapping entry pointing at the
          // deleted variable so the design file doesn't carry orphan
          // references. Other entries stay intact.
          let nextMapping = state.csvMapping;
          if (state.csvMapping && id in state.csvMapping.bindings) {
            const { [id]: _drop, ...rest } = state.csvMapping.bindings;
            void _drop;
            nextMapping = { ...state.csvMapping, bindings: rest };
          }
          return {
            variables: state.variables.filter((v) => v.id !== id),
            ...(pagesChanged ? { pages: nextPages } : {}),
            ...(nextMapping !== state.csvMapping ? { csvMapping: nextMapping } : {}),
          };
        }),

      loadCsv: (result) =>
        set(() => ({
          csvDataset: {
            headers: result.headers,
            rows: result.rows,
            source: result.source,
            activeRowIndex: 0,
          },
        })),

      clearCsv: () => {
        forgetImport();
        set({ csvDataset: null });
      },

      setActiveRow: (index) =>
        set((state) => {
          const ds = state.csvDataset;
          if (!ds || ds.rows.length === 0) return {};
          const clamped = Math.max(0, Math.min(index, ds.rows.length - 1));
          if (clamped === ds.activeRowIndex) return {};
          return { csvDataset: { ...ds, activeRowIndex: clamped } };
        }),

      setCsvMapping: (mapping) => set({ csvMapping: mapping }),

      applyMappingDraft: ({ variables, dataset, mapping, activeRowIndex }) =>
        set((state) => {
          if (selectPreviewLocksEditor(state)) return {};
          // Mirror setVariables' validation; bulk-replace with a
          // duplicate would leave the panel unfixable.
          const names = new Set<string>();
          const fns = new Set<number>();
          for (const v of variables) {
            const trimmed = v.name.trim();
            if (trimmed === '' || names.has(trimmed)) return {};
            names.add(trimmed);
            if (v.fnNumber < FN_NUMBER_MIN || v.fnNumber > FN_NUMBER_MAX) return {};
            if (fns.has(v.fnNumber)) return {};
            fns.add(v.fnNumber);
          }
          const rows = dataset.rows;
          const clampedIdx =
            rows.length === 0
              ? 0
              : Math.max(0, Math.min(activeRowIndex, rows.length - 1));
          return {
            variables,
            csvDataset: {
              headers: dataset.headers,
              rows: dataset.rows,
              source: dataset.source,
              activeRowIndex: clampedIdx,
            },
            csvMapping: mapping,
          };
        }),

      openCsvMappingModal: () => set({ csvMappingModalOpen: true }),
      closeCsvMappingModal: () => set({ csvMappingModalOpen: false }),

      enterPreviewMode: async () => {
        const state = get();
        if (state.previewMode.status === 'loading' || state.previewMode.status === 'active') {
          return;
        }
        const objs = currentObjects(state);
        const active = buildActiveCsvRow(state.csvDataset, state.csvMapping);
        const zpl = buildPreviewZpl(state.label, objs, state.variables, active);
        // Toggling preview off then on for a side-by-side pixel compare
        // shouldn't burn an API call when nothing changed.
        const cachedUrl = previewCache.get(zpl);
        if (cachedUrl !== null) {
          set({ previewMode: { status: 'active', url: cachedUrl } });
          return;
        }
        set({ previewMode: { status: 'loading' } });
        // Two checks guard against settling a stale request: the status
        // check catches an exit that happened during the fetch; the
        // reference-equality check catches the harder case where the
        // user exited AND re-entered with a different design (so status
        // is `loading` again — but for a different request whose result
        // we mustn't overwrite). The store mutates label and objects
        // immutably, so a reference change is the cheapest, most
        // precise way to detect a divergent state — no string rebuild
        // needed, and a page switch is caught too (different array).
        const isStale = (): boolean =>
          get().previewMode.status !== 'loading' ||
          get().label !== state.label ||
          currentObjects(get()) !== objs;
        try {
          const url = await fetchPreview(zpl, state.label);
          if (isStale()) {
            URL.revokeObjectURL(url);
            return;
          }
          previewCache.set(zpl, url);
          set({ previewMode: { status: 'active', url } });
        } catch (e) {
          if (isStale()) return;
          set({ previewMode: { status: 'error', error: labelaryErrorMessage(e) } });
        }
      },

      exitPreviewMode: () =>
        set((state) => {
          // The blob URL is owned by `previewCache` and intentionally
          // kept alive across exits so a re-toggle skips the fetch.
          if (state.previewMode.status === 'idle') return {};
          return { previewMode: { status: 'idle' } };
        }),
    }),
    {
      name: 'zpl-designer-session',
      version: 4,
      migrate: (persistedState, version) => migrateLegacy(persistedState, version) as LabelState,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        label: state.label,
        pages: state.pages,
        currentPageIndex: state.currentPageIndex,
        locale: state.locale,
        theme: state.theme,
        // thirdParty intentionally NOT persisted: until a settings UI lets
        // users explicitly opt in/out, the build-time env (VITE_THIRD_PARTY_*)
        // is authoritative on every load. Persisting now would freeze the
        // first run's env value and quietly defeat later build flips.
        labelaryNoticeAcknowledged: state.labelaryNoticeAcknowledged,
        canvasSettings: state.canvasSettings,
        variables: state.variables,
        csvMapping: state.csvMapping,
      }),
    }
    ),
    {
      partialize: (state) => ({
        label: state.label,
        pages: state.pages,
        currentPageIndex: state.currentPageIndex,
        variables: state.variables,
        csvMapping: state.csvMapping,
      }),
    }
  )
);

export const useCurrentObjects = () => useLabelStore(currentObjects);

/** Non-reactive sibling of `useCurrentObjects` for use inside event handlers
 *  and callbacks where a one-time read is wanted. */
export const getCurrentObjects = (): LabelObject[] =>
  currentObjects(useLabelStore.getState());

// Undo / redo. Wrapping zundo's hook so undo/redo become no-ops while
// the preview overlay is locking the editor. Header buttons read
// `canUndo`/`canRedo` from `pastStates`/`futureStates` — those keep
// reporting truthful values, so a separate UI check (or button
// disabled-state) still wins for visual feedback. The wrapper here is
// the load-bearing safety net for any caller that goes straight to
// `useHistory().undo()`.
const noopHistoryAction = () => {
  /* preview lock: no-op so undo/redo never replay state under a frozen
   * Labelary snapshot. */
};
export const useHistory = () => {
  const history = useStore(useLabelStore.temporal);
  const locked = useLabelStore(selectPreviewLocksEditor);
  if (!locked) return history;
  return { ...history, undo: noopHistoryAction, redo: noopHistoryAction };
};
