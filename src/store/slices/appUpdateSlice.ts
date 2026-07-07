import type { StateCreator } from 'zustand';
import type { Update } from '@tauri-apps/plugin-updater';
import { isDesktopShell } from '../../lib/platform';
import type { LabelState } from '../labelStore';

/** installed = downloadAndInstall succeeded but relaunch failed or is pending;
 *  the update applies on the next start, re-checking would be misleading. */
export type AppUpdatePhase =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; version: string; update: Update }
  | { phase: 'installing' }
  | { phase: 'installed' }
  | { phase: 'upToDate' }
  | { phase: 'error'; message: string };

export interface AppUpdateSlice {
  /** Session-only (not persisted, not undoable): single source for the
   *  startup banner and the settings tab, so both surfaces agree and a
   *  second install cannot start while one is in flight. */
  appUpdate: AppUpdatePhase;
  /** explicit=false is the silent startup check (only 'available' surfaces);
   *  explicit=true drives the settings button (checking/upToDate/error). */
  checkForAppUpdate: (explicit: boolean) => Promise<void>;
  installAppUpdate: () => Promise<void>;
  relaunchApp: () => Promise<void>;
  dismissAppUpdate: () => void;
}

export const createAppUpdateSlice: StateCreator<LabelState, [], [], AppUpdateSlice> = (
  set,
  get,
) => ({
  appUpdate: { phase: 'idle' },

  checkForAppUpdate: async (explicit) => {
    if (!isDesktopShell) return;
    const { phase } = get().appUpdate;
    if (phase === 'checking' || phase === 'installing' || phase === 'installed') return;
    if (explicit) set({ appUpdate: { phase: 'checking' } });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        set({ appUpdate: { phase: 'available', version: update.version, update } });
      } else if (explicit) {
        set({ appUpdate: { phase: 'upToDate' } });
      }
    } catch (e) {
      // The silent startup check must never disturb the editor.
      if (explicit) {
        set({ appUpdate: { phase: 'error', message: e instanceof Error ? e.message : String(e) } });
      }
    }
  },

  installAppUpdate: async () => {
    const state = get().appUpdate;
    if (state.phase !== 'available') return;
    set({ appUpdate: { phase: 'installing' } });
    try {
      await state.update.downloadAndInstall();
      set({ appUpdate: { phase: 'installed' } });
      await get().relaunchApp();
    } catch (e) {
      set({ appUpdate: { phase: 'error', message: e instanceof Error ? e.message : String(e) } });
    }
  },

  relaunchApp: async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch {
      // Stay in 'installed': the update applies on the next manual start.
    }
  },

  dismissAppUpdate: () => {
    set({ appUpdate: { phase: 'idle' } });
  },
});
