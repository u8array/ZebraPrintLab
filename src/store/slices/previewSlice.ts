import type { StateCreator } from 'zustand';
import { fetchPreview, labelaryErrorMessage } from '../../lib/labelary';
import { bitmapToDataUrl, fetchPrinterPreview } from '../../lib/printerPreview';
import { getPrinterAddress } from '../../lib/printerAddress';
import { buildActiveCsvRow } from '../../lib/variableBinding';
import { buildPreviewZpl } from '../../lib/printPreview';
import { currentObjects, selectEffectivePreviewProvider, selectLabelaryEndpoint } from '../labelStore.selectors';
import type { LabelState } from '../labelStore';

/** Preview canvas-overlay state (Labelary or the printer's own firmware
 *  render). Snapshot is frozen for the session's lifetime so the A/B
 *  comparison doesn't drift under the user. */
export type PreviewMode =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'active'; url: string }
  | { status: 'error'; error: string };

/** Single-entry URL cache keyed by provider + the ZPL that produced it.
 *  Module-level: blob URLs are non-serialisable, persisting them would
 *  resurrect stale identifiers across reloads. (revokeObjectURL on the
 *  printer provider's data URLs is a harmless no-op.) */
const previewCache = (() => {
  let entry: { key: string; url: string } | null = null;
  return {
    get(key: string): string | null {
      return entry && entry.key === key ? entry.url : null;
    },
    set(key: string, url: string): void {
      if (entry) URL.revokeObjectURL(entry.url);
      entry = { key, url };
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
    const provider = selectEffectivePreviewProvider(get());
    // First Labelary preview after a cold start races the async keychain read;
    // await it once (gated on the loaded flag) so the request isn't sent keyless.
    // Placed before the snapshot+guard so the captured design can't go stale and
    // a concurrent enter can't slip past the status guard.
    if (provider === 'labelary' && !get().labelaryApiKeyLoaded) {
      await get().hydrateLabelaryApiKey();
    }
    const state = get();
    if (state.previewMode.status === 'loading' || state.previewMode.status === 'active') {
      return;
    }
    const objs = currentObjects(state);
    const active = buildActiveCsvRow(state.csvDataset, state.csvMapping);
    const zpl = buildPreviewZpl(state.label, objs, state.variables, active, { blankSamples: true });
    // Cache the render so an off/on toggle doesn't re-fetch when nothing changed.
    // Labelary folds host+key in so a runtime endpoint change invalidates the old
    // render; the printer path is independent of both. NUL-joined so a ':' inside
    // any field can't shift a boundary and collide.
    const endpoint = selectLabelaryEndpoint(state);
    const cacheKey = provider === 'labelary'
      ? [provider, endpoint.host, endpoint.apiKey ?? '', zpl].join('\0')
      : [provider, zpl].join('\0');
    const cachedUrl = previewCache.get(cacheKey);
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

    if (provider === 'printer') {
      // Firmware render over raw TCP: ^IS stores the rendered label, ^HY
      // uploads its bitmap. Errors stay plain strings like labelary's.
      const { host, port } = getPrinterAddress();
      const fail = (error: string): void => {
        if (!isStale()) set({ previewMode: { status: 'error', error } });
      };
      if (!host) {
        fail('No printer address configured. Set the IP under Settings, Preview.');
        return;
      }
      const result = await fetchPrinterPreview(host, port, zpl);
      if (isStale()) return;
      switch (result.kind) {
        case 'bitmap': {
          const url = bitmapToDataUrl(result.bitmap);
          if (!url) {
            fail('Could not decode the printer preview.');
            return;
          }
          previewCache.set(cacheKey, url);
          set({ previewMode: { status: 'active', url } });
          return;
        }
        case 'refused':
          fail(`The printer refused the connection. Check that port ${port} is open.`);
          return;
        case 'unreachable':
          fail('Could not reach the printer. Check the IP address and network.');
          return;
        case 'error':
          fail(result.message);
          return;
        default: {
          // Exhaustive: a new result kind must be handled here, not silently
          // fall through to the Labelary path below with printer-specific ZPL.
          const _exhaustive: never = result;
          throw new Error(`unhandled preview result: ${JSON.stringify(_exhaustive)}`);
        }
      }
    }

    try {
      const url = await fetchPreview(zpl, state.label, endpoint.host, endpoint.apiKey);
      if (isStale()) {
        URL.revokeObjectURL(url);
        return;
      }
      previewCache.set(cacheKey, url);
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
