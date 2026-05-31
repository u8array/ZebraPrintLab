import type { StateCreator } from 'zustand';
import { fetchPreview, labelaryErrorMessage } from '../../lib/labelary';
import { buildActiveCsvRow } from '../../lib/variableBinding';
import { buildPreviewZpl } from '../../lib/printPreview';
import { currentObjects } from '../labelStore.selectors';
import type { LabelState } from '../labelStore';

/** Labelary canvas-overlay state. Snapshot is frozen for the session's
 *  lifetime so the A/B comparison doesn't drift under the user. */
export type PreviewMode =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'active'; url: string }
  | { status: 'error'; error: string };

/** Single-entry blob-URL cache keyed by the ZPL that produced it.
 *  Module-level: blob URLs are non-serialisable, persisting them would
 *  resurrect stale identifiers across reloads. */
const previewCache = (() => {
  let entry: { zpl: string; url: string } | null = null;
  return {
    get(zpl: string): string | null {
      return entry && entry.zpl === zpl ? entry.url : null;
    },
    set(zpl: string, url: string): void {
      if (entry) URL.revokeObjectURL(entry.url);
      entry = { zpl, url };
    },
    /** Test-only: drop the cached entry without revoking. */
    _resetForTests(): void {
      entry = null;
    },
  };
})();

/** Test-only handle to clear the preview cache between test cases. */
export const __resetPreviewCacheForTests = (): void => previewCache._resetForTests();

export interface PreviewSlice {
  previewMode: PreviewMode;
  /** Render current page → fetch → set status. Caller-checked: only
   *  call when `previewMode.status` is `idle` or `error`. */
  enterPreviewMode: () => Promise<void>;
  /** Reset to `idle`; blob URL stays cached for re-toggle. */
  exitPreviewMode: () => void;
}

export const createPreviewSlice: StateCreator<LabelState, [], [], PreviewSlice> = (set, get) => ({
  previewMode: { status: 'idle' },

  enterPreviewMode: async () => {
    const state = get();
    if (state.previewMode.status === 'loading' || state.previewMode.status === 'active') {
      return;
    }
    const objs = currentObjects(state);
    const active = buildActiveCsvRow(state.csvDataset, state.csvMapping);
    const zpl = buildPreviewZpl(state.label, objs, state.variables, active);
    // Toggling preview off then on for a side-by-side pixel compare
    // shouldn't burn an API call when nothing changed.
    const cachedUrl = previewCache.get(zpl);
    if (cachedUrl !== null) {
      set({ previewMode: { status: 'active', url: cachedUrl } });
      return;
    }
    set({ previewMode: { status: 'loading' } });
    // Stale-request guard: status check catches an exit mid-fetch; the
    // reference-equality check catches re-entry with a different design
    // (status is `loading` again but for a different request whose result
    // we mustn't overwrite). Refs change on every mutation thanks to
    // immutable updates.
    const isStale = (): boolean =>
      get().previewMode.status !== 'loading' ||
      get().label !== state.label ||
      currentObjects(get()) !== objs;
    try {
      const url = await fetchPreview(zpl, state.label);
      if (isStale()) {
        URL.revokeObjectURL(url);
        return;
      }
      previewCache.set(zpl, url);
      set({ previewMode: { status: 'active', url } });
    } catch (e) {
      if (isStale()) return;
      set({ previewMode: { status: 'error', error: labelaryErrorMessage(e) } });
    }
  },

  exitPreviewMode: () =>
    set((state) => {
      if (state.previewMode.status === 'idle') return {};
      return { previewMode: { status: 'idle' } };
    }),
});
