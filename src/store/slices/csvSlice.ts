import type { StateCreator } from 'zustand';
import { forgetImport, type CsvParseResult } from '../../lib/csvImport';
import {
  validateVariablesUnique,
  type CsvMapping,
  type Variable,
} from '../../types/Variable';
import { selectPreviewLocksEditor } from '../labelStore.selectors';
import type { LabelState } from '../labelStore';

/** Snapshot of an imported CSV plus the row the canvas is currently
 *  previewing. Distinct from the Variable→header mapping (which lives
 *  in the design file): this struct is the data itself, transient. */
export interface CsvDataset {
  headers: string[];
  rows: string[][];
  source: CsvParseResult['source'];
  /** Clamped into [0, rows.length - 1] by setters; meaningless when empty. */
  activeRowIndex: number;
}

export interface CsvSlice {
  /** Session-only CSV rows (NOT in persist-partialize — too bulky + leaky). */
  csvDataset: CsvDataset | null;
  /** Persistent mapping between Variables and CSV column names. Lives
   *  in the design file (round-tripped via Save/Load) so a user can
   *  re-import the same CSV structure later without re-mapping. */
  csvMapping: CsvMapping | null;
  /** Mapping-modal visibility flag. Lives in the store so the
   *  auto-open trigger (after import, on header mismatch) and the
   *  manual-open trigger share one flag without prop drilling. */
  csvMappingModalOpen: boolean;

  /** Replace the entire CSV dataset and reset the active row to 0. */
  loadCsv: (result: CsvParseResult) => void;
  /** Drop the current CSV dataset. Does not touch `csvMapping`. */
  clearCsv: () => void;
  /** Move the canvas preview to a different row. Out-of-range indices
   *  are silently clamped; no-op when no CSV is loaded. */
  setActiveRow: (index: number) => void;
  /** Set or replace the CSV mapping (null clears it). */
  setCsvMapping: (mapping: CsvMapping | null) => void;
  /** Atomic commit for the mapping-modal Apply path: updates variables,
   *  dataset, mapping and active row in a single store mutation so
   *  zundo records one undo step. */
  applyMappingDraft: (input: {
    variables: Variable[];
    dataset: CsvParseResult;
    mapping: CsvMapping;
    activeRowIndex: number;
  }) => void;
  openCsvMappingModal: () => void;
  closeCsvMappingModal: () => void;
}

export const createCsvSlice: StateCreator<LabelState, [], [], CsvSlice> = (set) => ({
  csvDataset: null,
  csvMapping: null,
  csvMappingModalOpen: false,

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
      if (!validateVariablesUnique(variables)) return {};
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
});
