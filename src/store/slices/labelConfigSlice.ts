import type { StateCreator } from 'zustand';
import type { LabelConfig } from '../../types/LabelConfig';
import type { Page } from '../../types/Group';
import type { Variable, CsvMapping } from '../../types/Variable';
import { forgetImport } from '../../lib/csvImport';
import { selectPreviewLocksEditor } from '../labelStore.selectors';
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
      return { label: { ...state.label, ...config } };
    }),

  loadDesign: (label, pages, variables, csvMapping) => {
    if (selectPreviewLocksEditor(get())) return;
    // Drop the prior design's CSV cache: the raw text in the module
    // cache belongs to that file, not the one being loaded.
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
});
