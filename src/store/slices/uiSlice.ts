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
  | 'identity'
  | 'maintenance';

export type SidebarTab = 'properties' | 'layers' | 'variables' | 'fonts';

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

  /** Right-sidebar tab. Lives in the store so canvas interactions can
   *  drive the panel (e.g. double-click a text field). Transient; not
   *  in partialize so a reload resets to 'properties'. */
  sidebarTab: SidebarTab;
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
  setSidebarTab: (tab: SidebarTab) => void;
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
  sidebarTab: 'properties',
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
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
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
