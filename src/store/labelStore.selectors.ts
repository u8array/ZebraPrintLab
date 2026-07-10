import type { LabelObject } from '../types/Group';
import { isDefaultHost, resolveHost, resolveApiKey } from '../lib/labelary';
import { isDesktopShell } from '../lib/platform';
import type { CsvDataset } from './slices/csvSlice';
import type { CsvMapping } from '../types/Variable';
import type { LabelState } from './labelStore';
import type { PageState } from './labelStore.internals';
import { PER_LABEL_ZPL_FIELDS } from '../types/LabelConfig';

export const currentObjects = (state: PageState): LabelObject[] =>
  state.pages[state.currentPageIndex]?.objects ?? [];

/** True while any per-label print override is set; drives the reset button's
 *  visibility so its disappearance after a reset doubles as feedback. */
export const selectHasPerLabelOverrides = (s: LabelState): boolean =>
  PER_LABEL_ZPL_FIELDS.some((k) => s.label[k] !== undefined);

/** True when a Labelary network call is permitted: the integration is on
 *  AND, on the public host, the user has acknowledged the privacy notice.
 *  A custom host needs no acknowledgement (the operator owns the endpoint),
 *  mirroring {@link selectLabelaryNoticeRequired}. UI buttons read
 *  `thirdParty.labelary` and `labelaryNoticeAcknowledged` separately
 *  to distinguish "hide" (gate off) from "show notice first". */
export const canCallLabelary = (s: LabelState): boolean =>
  s.thirdParty.labelary && (!isDefaultHost(s.labelaryHost) || s.labelaryNoticeAcknowledged);

/** True when clicking a Labelary-backed action must first surface the
 *  privacy notice modal. A custom-host build implies the operator
 *  already controls the endpoint and no third-party disclosure is needed. */
export const selectLabelaryNoticeRequired = (s: LabelState): boolean =>
  isDefaultHost(s.labelaryHost) && !s.labelaryNoticeAcknowledged;

/** Effective Labelary endpoint: the runtime host/key resolved against the
 *  build env fallback. Single owner of the store-field to resolver mapping,
 *  shared by the preview overlay and the print-to-window flow. */
export const selectLabelaryEndpoint = (s: LabelState): { host: string; apiKey?: string } => ({
  host: resolveHost(s.labelaryHost),
  apiKey: resolveApiKey(s.labelaryApiKey),
});

/** The provider the preview will actually use: the printer path needs the
 *  desktop shell's raw sockets, so a persisted 'printer' choice degrades to
 *  Labelary in the web build instead of dead-ending the preview button. */
export const selectEffectivePreviewProvider = (s: LabelState): 'labelary' | 'printer' =>
  s.previewProvider === 'printer' && isDesktopShell ? 'printer' : 'labelary';

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
