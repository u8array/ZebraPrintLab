import { isMappingCompatibleWith, type ColumnMapping } from '@zplab/core/types/Variable';
import { useLabelStore } from './labelStore';
import type { DatasetInput } from '@zplab/core/types/DataSource';

/** The one auto-open-mapping-modal rule, shared by every dataset producer. */
export function needsMappingReview(
  mapping: ColumnMapping | null,
  headers: readonly string[],
): boolean {
  return !mapping || !isMappingCompatibleWith(mapping, headers);
}

/** Snapshot of the current data-context epoch; a deferred commit captures it and
 *  later checks {@link isCurrentDataContext} to abandon if the context changed.
 *  The one place the store field is read. */
export function currentDataContext(): number {
  return useLabelStore.getState().datasetFetchToken;
}

/** True if `token` (from {@link currentDataContext}) is still the live context,
 *  i.e. nothing loaded/cleared/cancelled it or replaced the document since. */
export function isCurrentDataContext(token: number): boolean {
  return token === useLabelStore.getState().datasetFetchToken;
}

/** Apply an already-tabular fetch (db, excel) to the store: dataset plus mapping
 *  review. Internal on purpose: the only caller is {@link loadFetchedDataset},
 *  so every fetched dataset passes the context guard. */
function applyFetchedDataset(input: DatasetInput): void {
  const { loadDataset, columnMapping, openMappingModal, clearUserError } =
    useLabelStore.getState();
  loadDataset(input);
  clearUserError();
  // db/excel always carry real named headers, so a headerless CSV mapping
  // (bound to synthetic `Column N`) can't match despite the column-count
  // shortcut in isMappingCompatibleWith; force a review.
  const headerless = columnMapping?.parseOptions?.hasHeaderRow === false;
  if (headerless || needsMappingReview(columnMapping, input.headers)) openMappingModal();
}

/** The one gated entry for async dataset fetches: commits only if the context
 *  is still `token` (default: sampled now, or pass a pre-sampled one for an op
 *  that began earlier), so a stale fetch can't clobber. False if superseded. */
export async function loadFetchedDataset(
  producer: () => Promise<DatasetInput>,
  token: number = currentDataContext(),
): Promise<boolean> {
  const input = await producer();
  if (!isCurrentDataContext(token)) return false;
  applyFetchedDataset(input);
  return true;
}
