import type { StateCreator } from 'zustand';
import type { LabelConfig } from '../../types/LabelConfig';
import type { Page } from '../../types/Group';
import type { Variable, CsvMapping } from '../../types/Variable';
import { forgetImport } from '../../lib/csvImport';
import { dropLegacyFontBindings } from '../../lib/customFonts';
import { selectPreviewLocksEditor } from '../labelStore.selectors';
import { configPatchAffectsEmit, dropPageOverlays } from '../labelStore.internals';
import type { LabelState } from '../labelStore';

export interface LabelConfigSlice {
  label: LabelConfig;
  /** Patch the per-label config; undefined keys fall back to width/dpmm
   *  defaults at emit time. */
  setLabelConfig: (config: Partial<LabelConfig>) => void;
  /** Atomic file-open: resets label, pages, currentPageIndex,
   *  selectedIds, variables, csvMapping, csvDataset in one set() so
   *  zundo records one undo step and no intermediate state leaks.
   *  Also clears the CSV-import module cache. */
  loadDesign: (
    label: LabelConfig,
    pages: Page[],
    variables?: Variable[],
    csvMapping?: CsvMapping | null,
  ) => void;
  /** Append pages to the current design without touching label config.
   *  Switches focus to the first appended page. */
  appendPages: (pages: Page[]) => void;
}

export const createLabelConfigSlice: StateCreator<LabelState, [], [], LabelConfigSlice> = (set, get) => ({
  label: { widthMm: 100, heightMm: 60, dpmm: 8 },

  setLabelConfig: (config) =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      const label = { ...state.label, ...config };
      // An emit-affecting config edit invalidates each page overlay's verbatim
      // config bytes; drop overlays so those pages regenerate with the new
      // value (config-segment patching is a later stage).
      if (!configPatchAffectsEmit(state.label, config)) return { label };
      return { label, pages: dropPageOverlays(state.pages) };
    }),

  loadDesign: (label, pages, variables, csvMapping) => {
    if (selectPreviewLocksEditor(get())) return;
    // Drop the prior design's CSV cache: the raw text in the module
    // cache belongs to that file, not the one being loaded.
    forgetImport();
    set({
      // Scrub legacy path-less font bindings at the load boundary so no
      // component logic or extra undo step is needed.
      label: { ...label, customFonts: dropLegacyFontBindings(label.customFonts) },
      pages: pages.length > 0 ? pages : [{ objects: [] }],
      currentPageIndex: 0,
      selectedIds: [],
      variables: variables ?? [],
      csvMapping: csvMapping ?? null,
      csvDataset: null,
    });
  },

  appendPages: (pages) =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      if (pages.length === 0) return {};
      // Strip overlays from appended pages: they are recontextualized into the
      // current design (whose label config replaces the imported one), so their
      // captured source config/^FN bytes no longer apply and must regenerate.
      const newPages = [...state.pages, ...dropPageOverlays(pages)];
      return {
        pages: newPages,
        currentPageIndex: state.pages.length,
        selectedIds: [],
      };
    }),
});
