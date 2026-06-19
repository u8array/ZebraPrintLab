import type { StateCreator } from 'zustand';
import type { Unit } from '../../lib/units';
import type { ViewRotation } from '../../components/Canvas/rotationGeometry';
import type { LocaleCode } from '../../locales';
import {
  detectLocale,
  detectInitialTheme,
  thirdPartyDefaults,
} from '../labelStore.internals';
import type { LabelState } from '../labelStore';

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

/** Tab IDs for the Printer Settings modal. Adding a tab is a one-line
 *  union extension plus the matching locale-key + content component. */
export type PrinterSettingsTab =
  | 'mediaFeed'
  | 'printQuality'
  | 'clockTime'
  | 'encodingLanguage'
  | 'fonts'
  | 'identity'
  | 'maintenance';

export type SidebarTab = 'properties' | 'layers' | 'variables' | 'fonts';

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
  locale: LocaleCode;
  /** UI theme. Initial value seeded from prefers-color-scheme; once
   *  toggled the explicit choice persists. */
  theme: ThemePreference;
  /** Per-service gates for third-party network calls. Sourced from
   *  build-time env on every load (see thirdPartyDefaults); not
   *  persisted, so env is the single source of truth. */
  thirdParty: { labelary: boolean };
  /** Whether the user has dismissed the one-time Labelary privacy notice. */
  labelaryNoticeAcknowledged: boolean;
  canvasSettings: CanvasSettings;
  /** Palette favorites: registry type-IDs the user pinned to the top of the
   *  object palette. Persisted (a UI preference), not undoable. */
  paletteFavorites: string[];
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
  /** One-shot focus request scoped to a single object. The nonce
   *  increments per call so consumers can re-fire even for the same
   *  id; TemplateContentInput's effect compares its own `objectId`
   *  prop to `id` so only the requested editor takes focus. Transient. */
  editorFocusRequest: { id: string; nonce: number } | null;

  setLocale: (locale: LocaleCode) => void;
  setTheme: (theme: ThemePreference) => void;
  setThirdPartyEnabled: (service: 'labelary', enabled: boolean) => void;
  acknowledgeLabelaryNotice: () => void;
  setCanvasSettings: (settings: Partial<CanvasSettings>) => void;
  /** Pin/unpin a registry type in the palette favorites. */
  toggleFavorite: (type: string) => void;
  setShowZplCommands: (show: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setBlockDragMode: (mode: BlockDragMode) => void;
  setAlignRef: (ref: AlignSelectionRef) => void;
  setPrinterSettingsTab: (tab: PrinterSettingsTab | null) => void;
  openZebraPrint: (source: 'label' | 'setupScript') => void;
  closeZebraPrint: () => void;
  /** Fire a focus request. Does NOT touch the sidebar tab; caller
   *  composes `setSidebarTab('properties')` when the request would
   *  otherwise land on an unmounted editor. */
  requestContentEditorFocus: (id: string) => void;
}

export const createUiSlice: StateCreator<LabelState, [], [], UiSlice> = (set) => ({
  locale: detectLocale(),
  theme: detectInitialTheme(),
  thirdParty: thirdPartyDefaults(),
  labelaryNoticeAcknowledged: false,
  canvasSettings: {
    showGrid: false,
    snapEnabled: false,
    snapSizeMm: 1,
    zoom: 1,
    unit: 'mm',
    viewRotation: 0,
    csvRenderMode: 'preview',
  },
  paletteFavorites: [],
  showZplCommands: false,
  sidebarTab: 'properties',
  blockDragMode: 'frame',
  alignRef: 'selection',
  printerSettingsTab: null,
  zebraPrintSource: null,
  editorFocusRequest: null,

  setLocale: (locale) => set({ locale }),
  setTheme: (theme) => set({ theme }),
  setThirdPartyEnabled: (service, enabled) =>
    set((state) => ({ thirdParty: { ...state.thirdParty, [service]: enabled } })),
  acknowledgeLabelaryNotice: () => set({ labelaryNoticeAcknowledged: true }),
  setCanvasSettings: (settings) =>
    set((state) => ({ canvasSettings: { ...state.canvasSettings, ...settings } })),
  toggleFavorite: (type) =>
    set((state) => ({
      paletteFavorites: state.paletteFavorites.includes(type)
        ? state.paletteFavorites.filter((t) => t !== type)
        : [...state.paletteFavorites, type],
    })),
  setShowZplCommands: (show) => set({ showZplCommands: show }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setBlockDragMode: (mode) => set({ blockDragMode: mode }),
  setAlignRef: (ref) => set({ alignRef: ref }),
  setPrinterSettingsTab: (tab) => set({ printerSettingsTab: tab }),
  openZebraPrint: (source) => set({ zebraPrintSource: source }),
  closeZebraPrint: () => set({ zebraPrintSource: null }),
  requestContentEditorFocus: (id) =>
    set((state) => ({
      editorFocusRequest: {
        id,
        nonce: (state.editorFocusRequest?.nonce ?? 0) + 1,
      },
    })),
});
