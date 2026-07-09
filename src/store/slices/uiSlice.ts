import type { StateCreator } from 'zustand';
import type { Unit } from '../../lib/units';
import type { ViewRotation } from '../../components/Canvas/rotationGeometry';
import { fallbackTranslations, loadLocale, type LocaleCode, type Translations } from '../../locales';
import {
  detectLocale,
  detectInitialTheme,
  thirdPartyDefaults,
} from '../labelStore.internals';
import type { LabelState } from '../labelStore';
import { defaultPaletteRows } from '../../registry/paletteTypes';

export interface CanvasSettings {
  showGrid: boolean;
  snapEnabled: boolean;
  snapSizeMm: number;
  /** Object-to-object alignment snapping (guides). On by default; a held
   *  Ctrl/Cmd bypasses it per-gesture (move, resize, line reshape via the
   *  shared useSnapBypassRef), this switch disables it entirely. */
  smartSnapEnabled: boolean;
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

/** Which renderer the label preview asks: Labelary (software approximation)
 *  or the connected printer's own firmware (^IS/^HY, desktop only). */
export type PreviewProvider = 'labelary' | 'printer';

/** Tab IDs for the Printer Settings modal. Adding a tab is a one-line
 *  union extension plus the matching locale-key + content component. */
export type PrinterSettingsTab =
  | 'appSettings'
  | 'previewSettings'
  | 'mediaFeed'
  | 'printQuality'
  | 'output'
  | 'clockTime'
  | 'encodingLanguage'
  | 'fonts'
  | 'identity'
  | 'maintenance';

export type SidebarTab = 'properties' | 'layers' | 'variables' | 'fonts';

/** One favorites row: a single concrete object, identified by its
 *  {@link AddableEntry} id (a registry type or a preset id). `id` is the stable
 *  per-row key drag-reorder needs; `entryId` is the object it spawns/pins. */
export interface PaletteRow {
  id: string;
  entryId: string;
}
export type PaletteView = 'favorites' | 'flat';

/** What a ^FB block's resize handles edit: the wrap frame (blockWidth /
 *  line cap) or the glyphs (font width = stretch / height). Alt+drag flips
 *  it for one drag. Transient editor state; never stored in the design. */
export type BlockDragMode = 'frame' | 'glyph';

/** Reference frame for the "Align" section's toggle. 'selection' = the
 *  selection union bbox, 'key' = the last-selected object (selection order is
 *  preserved, so the key is the final entry of selectedIds). The "Align to
 *  label" section always uses the label rect and so is not part of this union.
 *  Transient editor tool state; never persisted (not in partialize). */
export type AlignSelectionRef = 'selection' | 'key';

export interface UiSlice {
  /** The user's language PREFERENCE (persisted). Can briefly differ from
   *  `loadedLocale` while a chunk loads, or longer when loading failed. */
  locale: LocaleCode;
  /** The locale whose dictionary is actually applied; set atomically with
   *  `translations`. Behavior keyed on language (dir/Intl) belongs here,
   *  not on the preference. */
  loadedLocale: LocaleCode;
  /** Loaded dictionary for `loadedLocale`; seeded with the bundled en
   *  fallback and swapped asynchronously by applyLocale. */
  translations: Translations;
  /** UI theme. Initial value seeded from prefers-color-scheme; once
   *  toggled the explicit choice persists. */
  theme: ThemePreference;
  /** Per-service gates for third-party network calls. Sourced from
   *  build-time env on every load (see thirdPartyDefaults); not
   *  persisted, so env is the single source of truth. */
  thirdParty: { labelary: boolean };
  /** Whether the user has dismissed the one-time Labelary privacy notice. */
  labelaryNoticeAcknowledged: boolean;
  previewProvider: PreviewProvider;
  canvasSettings: CanvasSettings;
  /** Curated object-palette rows ({type, variant} instances, duplicates
   *  allowed) and the palette view mode. Persisted UI preferences, not
   *  undoable; default = one row per type at its default variant. */
  paletteRows: PaletteRow[];
  paletteView: PaletteView;
  /** Curation mode for the type-list: shows remove buttons + "add type" and
   *  turns the grip into a reorder handle (canvas-spawn drag is suspended).
   *  Transient editor state, not persisted. */
  paletteEditing: boolean;
  /** Power-user opt-in: show the emitted ZPL command next to each properties
   *  field. Persisted UI preference; default off so beginners aren't burdened. */
  showZplCommands: boolean;

  /** Right-sidebar tab. Lives in the store so canvas interactions can
   *  drive the panel (e.g. double-click a text field). Transient; not
   *  in partialize so a reload resets to 'properties'. */
  sidebarTab: SidebarTab;
  /** Block resize-handle mode; see BlockDragMode. Transient. */
  blockDragMode: BlockDragMode;
  /** Reference for the "Align" section toggle; see AlignSelectionRef. Transient. */
  alignRef: AlignSelectionRef;
  printerSettingsTab: PrinterSettingsTab | null;
  /** Cross-component trigger for the "send to Zebra" dialog. `null`
   *  keeps the dialog closed. */
  zebraPrintSource: 'label' | 'setupScript' | null;
  /** Barcode object id whose GS1 content builder modal is open; null = closed. */
  gs1BuilderObjectId: string | null;
  /** Object id whose typed-content builder modal is open; null = closed.
   *  Shared by QR and DataMatrix (content is symbology-agnostic). */
  contentBuilderObjectId: string | null;
  /** Object id whose variable-builder modal is open; null = closed. The single
   *  content editor for bindable fields (variables/clock/serial tokens). */
  variableBuilderObjectId: string | null;
  /** One-shot focus request scoped to a single object. The nonce
   *  increments per call so consumers can re-fire even for the same
   *  id; TemplateContentInput's effect compares its own `objectId`
   *  prop to `id` so only the requested editor takes focus. Transient. */
  editorFocusRequest: { id: string; nonce: number } | null;

  setLocale: (locale: LocaleCode) => void;
  /** Single orchestration point for locale loading: fetch (cached) chunk,
   *  latest-wins guard, atomic translations+loadedLocale swap, failure log.
   *  Never rejects; consumed by setLocale and the main.tsx bootstrap. */
  applyLocale: (locale: LocaleCode) => Promise<void>;
  setTheme: (theme: ThemePreference) => void;
  setThirdPartyEnabled: (service: 'labelary', enabled: boolean) => void;
  setPreviewProvider: (provider: PreviewProvider) => void;
  acknowledgeLabelaryNotice: () => void;
  revokeLabelaryNotice: () => void;
  /** Reset app preferences (theme, canvas, palette, power-user, Labelary
   *  consent) to defaults. Keeps the current design and the chosen language. */
  resetSettings: () => void;
  setCanvasSettings: (settings: Partial<CanvasSettings>) => void;
  /** Pin/unpin a favorites row by entry id (the search star toggle): adds a row
   *  when absent, removes the matching row(s) when present. */
  togglePaletteRow: (entryId: string) => void;
  removePaletteRow: (index: number) => void;
  /** Move the row with `activeId` to where `overId` sits (drag-reorder). */
  reorderPaletteRows: (activeId: string, overId: string) => void;
  setPaletteView: (view: PaletteView) => void;
  togglePaletteEditing: () => void;
  setShowZplCommands: (show: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setBlockDragMode: (mode: BlockDragMode) => void;
  setAlignRef: (ref: AlignSelectionRef) => void;
  setPrinterSettingsTab: (tab: PrinterSettingsTab | null) => void;
  openZebraPrint: (source: 'label' | 'setupScript') => void;
  closeZebraPrint: () => void;
  openGs1Builder: (objectId: string) => void;
  closeGs1Builder: () => void;
  openContentBuilder: (objectId: string) => void;
  closeContentBuilder: () => void;
  openVariableBuilder: (objectId: string) => void;
  closeVariableBuilder: () => void;
  /** Fire a focus request. Does NOT touch the sidebar tab; caller
   *  composes `setSidebarTab('properties')` when the request would
   *  otherwise land on an unmounted editor. */
  requestContentEditorFocus: (id: string) => void;
}

/** Canvas defaults; shared by initial state and `resetSettings` so the two
 *  never drift. Note `resetSettings` deliberately preserves the live
 *  `zoom`/`viewRotation` from these defaults (see there). */
export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  showGrid: false,
  snapEnabled: false,
  snapSizeMm: 1,
  smartSnapEnabled: true,
  zoom: 1,
  unit: 'mm',
  viewRotation: 0,
  csvRenderMode: 'preview',
};

type UiPrefs = Pick<
  UiSlice,
  | 'theme'
  | 'thirdParty'
  | 'labelaryNoticeAcknowledged'
  | 'previewProvider'
  | 'canvasSettings'
  | 'paletteRows'
  | 'paletteView'
  | 'paletteEditing'
  | 'showZplCommands'
>;

/** Defaults `resetSettings` restores. Shared with initial state so the `Pick`
 *  turns a forgotten entry into a compile error. Excludes `locale` (reset keeps
 *  the language). */
function defaultUiPrefs(): UiPrefs {
  return {
    theme: detectInitialTheme(),
    thirdParty: thirdPartyDefaults(),
    labelaryNoticeAcknowledged: false,
    previewProvider: 'labelary',
    canvasSettings: { ...DEFAULT_CANVAS_SETTINGS },
    paletteRows: defaultPaletteRows(),
    paletteView: 'flat',
    paletteEditing: false,
    showZplCommands: false,
  };
}

export const createUiSlice: StateCreator<LabelState, [], [], UiSlice> = (set, get) => ({
  locale: detectLocale(),
  loadedLocale: 'en',
  translations: fallbackTranslations,
  ...defaultUiPrefs(),
  sidebarTab: 'properties',
  blockDragMode: 'frame',
  alignRef: 'selection',
  printerSettingsTab: null,
  zebraPrintSource: null,
  gs1BuilderObjectId: null,
  contentBuilderObjectId: null,
  variableBuilderObjectId: null,
  editorFocusRequest: null,

  setLocale: (locale) => {
    // Async swap: the previous language stays visible for the chunk's load
    // time; `locale` records the preference immediately.
    set({ locale });
    void get().applyLocale(locale);
  },
  applyLocale: async (locale) => {
    try {
      const translations = await loadLocale(locale);
      // Locale may have changed again meanwhile; only the latest wins.
      if (get().locale === locale) set({ translations, loadedLocale: locale });
    } catch (err) {
      // Failed fetch (e.g. offline switch, broken deploy): the previous
      // dictionary stays active and loadedLocale keeps showing that.
      console.warn(`locale chunk for "${locale}" failed to load`, err);
    }
  },
  setTheme: (theme) => set({ theme }),
  setThirdPartyEnabled: (service, enabled) =>
    set((state) => ({ thirdParty: { ...state.thirdParty, [service]: enabled } })),
  // Tear down a live overlay on switch so one provider's render can't linger
  // while the toggle already names the other.
  setPreviewProvider: (provider) => {
    set({ previewProvider: provider });
    get().exitPreviewMode();
  },
  acknowledgeLabelaryNotice: () => set({ labelaryNoticeAcknowledged: true }),
  // Revoke consent so the Labelary gate closes again; re-enabling re-shows the
  // disclosure, keeping consent explicit and reversible. Tear down any live
  // preview so a Labelary-rendered overlay can't linger after consent is gone.
  revokeLabelaryNotice: () => {
    set({ labelaryNoticeAcknowledged: false });
    get().exitPreviewMode();
  },
  // Scoped reset: prefs to defaults, design and language untouched. Not a
  // localStorage nuke, so it works the same in the browser and a Tauri build.
  // Keeps live view state (zoom/rotation): the fit-to-view is a one-shot at
  // mount, so resetting zoom would strand the canvas at 100% with no re-fit.
  resetSettings: () => {
    set((state) => {
      const prefs = defaultUiPrefs();
      return {
        ...prefs,
        canvasSettings: {
          ...prefs.canvasSettings,
          zoom: state.canvasSettings.zoom,
          viewRotation: state.canvasSettings.viewRotation,
        },
      };
    });
    // Reset drops Labelary consent; end any live preview so it doesn't linger.
    get().exitPreviewMode();
  },
  setCanvasSettings: (settings) =>
    set((state) => ({ canvasSettings: { ...state.canvasSettings, ...settings } })),
  togglePaletteRow: (entryId) =>
    set((state) => {
      if (state.paletteRows.some((r) => r.entryId === entryId)) {
        return { paletteRows: state.paletteRows.filter((r) => r.entryId !== entryId) };
      }
      const id = `${entryId}-${crypto.randomUUID().slice(0, 8)}`;
      return { paletteRows: [...state.paletteRows, { id, entryId }] };
    }),
  removePaletteRow: (index) =>
    set((state) => ({ paletteRows: state.paletteRows.filter((_, i) => i !== index) })),
  reorderPaletteRows: (activeId, overId) =>
    set((state) => {
      const from = state.paletteRows.findIndex((r) => r.id === activeId);
      const to = state.paletteRows.findIndex((r) => r.id === overId);
      if (from < 0 || to < 0 || from === to) return {};
      const rows = state.paletteRows.slice();
      const [moved] = rows.splice(from, 1);
      if (!moved) return {};
      rows.splice(to, 0, moved);
      return { paletteRows: rows };
    }),
  setPaletteView: (view) => set({ paletteView: view }),
  togglePaletteEditing: () => set((state) => ({ paletteEditing: !state.paletteEditing })),
  setShowZplCommands: (show) => set({ showZplCommands: show }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setBlockDragMode: (mode) => set({ blockDragMode: mode }),
  setAlignRef: (ref) => set({ alignRef: ref }),
  setPrinterSettingsTab: (tab) => set({ printerSettingsTab: tab }),
  openZebraPrint: (source) => set({ zebraPrintSource: source }),
  closeZebraPrint: () => set({ zebraPrintSource: null }),
  openGs1Builder: (objectId) => set({ gs1BuilderObjectId: objectId }),
  closeGs1Builder: () => set({ gs1BuilderObjectId: null }),
  openContentBuilder: (objectId) => set({ contentBuilderObjectId: objectId }),
  closeContentBuilder: () => set({ contentBuilderObjectId: null }),
  openVariableBuilder: (objectId) => set({ variableBuilderObjectId: objectId }),
  closeVariableBuilder: () => set({ variableBuilderObjectId: null }),
  requestContentEditorFocus: (id) =>
    set((state) => ({
      editorFocusRequest: {
        id,
        nonce: (state.editorFocusRequest?.nonce ?? 0) + 1,
      },
    })),
});
