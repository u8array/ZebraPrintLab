import type { StateCreator } from 'zustand';
import { PER_LABEL_ZPL_FIELDS, type LabelConfig } from '@zplab/core/types/LabelConfig';
import type { Page } from '@zplab/core/types/Group';
import type { Variable, CsvMapping } from '@zplab/core/types/Variable';
import { forgetImport } from '../../lib/csvImport';
import { dropLegacyFontBindings } from '@zplab/core/lib/customFonts';
import { parseDesignFile, designFileErrors } from '@zplab/core/lib/designFile';
import { selectPreviewLocksEditor } from '../labelStore.selectors';
import { configPatchAffectsEmit } from '../labelStore.internals';
import { dropPageOverlays } from '@zplab/core/lib/pageOverlay';
import { rescaleDesign } from '../../lib/densityRescale';
import type { LabelState } from '../labelStore';

export interface LabelConfigSlice {
  label: LabelConfig;
  /** Patch the per-label config; undefined keys fall back to width/dpmm
   *  defaults at emit time. */
  setLabelConfig: (config: Partial<LabelConfig>) => void;
  /** Clear every PER_LABEL_ZPL_FIELDS override back to unset (printer default). */
  resetPerLabelConfig: () => void;
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
  /** Parse serialized design-file text and load it, routing a parse failure
   *  to userError; every text source (file open, MCP push) shares this path. */
  loadDesignText: (text: string) => void;
  /** Append pages to the current design without touching label config.
   *  Switches focus to the first appended page. */
  appendPages: (pages: Page[]) => void;
  /** Change print density and proportionally rescale every dot-valued field so
   *  the physical size is preserved (one undo step). */
  rescaleDensity: (toDpmm: number) => void;
}

export const createLabelConfigSlice: StateCreator<LabelState, [], [], LabelConfigSlice> = (set, get, api) => ({
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

  resetPerLabelConfig: () =>
    get().setLabelConfig(
      Object.fromEntries(PER_LABEL_ZPL_FIELDS.map((k) => [k, undefined])) as Partial<LabelConfig>,
    ),

  loadDesign: (label, pages, variables, csvMapping) => {
    if (selectPreviewLocksEditor(get())) return;
    // Drop the prior design's CSV cache: the raw text in the module
    // cache belongs to that file, not the one being loaded.
    forgetImport();
    // Whole-document replace via the raw store setState, NOT the dirty-tracking
    // wrapped `set`: a loaded file's `dirty` flags are authoritative, so diffing
    // the incoming pages against the current document (stable ids survive a save)
    // would falsely stamp untouched objects dirty and break overlay replay.
    api.setState({
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

  loadDesignText: (text) => {
    const result = parseDesignFile(text);
    if (!result.ok) {
      get().setUserError(designFileErrors[result.error]);
      return;
    }
    get().clearUserError();
    get().loadDesign(
      result.value.label,
      result.value.pages,
      result.value.variables,
      result.value.csvMapping,
    );
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

  rescaleDensity: (toDpmm) =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      if (toDpmm === state.label.dpmm) return {};
      // Geometry changes, so the captured overlay bytes no longer match; drop
      // them so the rescaled pages regenerate from the model.
      const { pages, label } = rescaleDesign(state.pages, state.label, state.label.dpmm, toDpmm);
      return { label, pages: dropPageOverlays(pages) };
    }),
});
