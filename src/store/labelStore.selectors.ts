import type { LabelObject } from '../types/Group';
import { isDefaultLabelaryHost } from '../lib/labelary';
import type { CsvDataset } from './slices/csvSlice';
import type { CsvMapping } from '../types/Variable';
import type { LabelState } from './labelStore';
import type { PageState } from './labelStore.internals';

export const currentObjects = (state: PageState): LabelObject[] =>
  state.pages[state.currentPageIndex]?.objects ?? [];

/** True when a Labelary network call is permitted: the gate is on AND
 *  the user has seen the privacy notice. UI buttons read
 *  `thirdParty.labelary` and `labelaryNoticeAcknowledged` separately
 *  to distinguish "hide" (gate off) from "show notice first". */
export const canCallLabelary = (s: LabelState): boolean =>
  s.thirdParty.labelary && s.labelaryNoticeAcknowledged;

/** True when clicking a Labelary-backed action must first surface the
 *  privacy notice modal. A custom-host build implies the operator
 *  already controls the endpoint and no third-party disclosure is needed. */
export const selectLabelaryNoticeRequired = (s: LabelState): boolean =>
  isDefaultLabelaryHost() && !s.labelaryNoticeAcknowledged;

/** True while the preview overlay is taking input away from the editor.
 *  Loading and active both qualify (loading blocks edits so the snapshot
 *  isn't already stale); error and idle return false so the user can
 *  keep working after dismissing a failure. */
export const selectPreviewLocksEditor = (s: LabelState): boolean =>
  s.previewMode.status === 'loading' || s.previewMode.status === 'active';

/** The dataset + mapping pair that batch emit needs, or null when batch
 *  emit would produce nothing different from a single label. Requires a
 *  loaded CSV with rows and at least one mapped Variable. */
export const selectBatchInputs = (
  s: LabelState,
): { dataset: CsvDataset; mapping: CsvMapping } | null => {
  const { csvDataset, csvMapping } = s;
  if (!csvDataset || csvDataset.rows.length === 0) return null;
  if (!csvMapping || Object.keys(csvMapping.bindings).length === 0) return null;
  return { dataset: csvDataset, mapping: csvMapping };
};

/** Boolean form of {@link selectBatchInputs}. */
export const selectCanBatchExport = (s: LabelState): boolean =>
  selectBatchInputs(s) !== null;
