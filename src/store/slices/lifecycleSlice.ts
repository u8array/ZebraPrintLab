import type { StateCreator } from 'zustand';
import type { LabelState } from '../labelStore';

/** Desktop process lifecycle (relaunch, quit) via tauri-plugin-process. Kept
 *  separate from the updater slice so app-lifecycle actions have a home that
 *  isn't named after updates; installAppUpdate reaches relaunchApp via get(). */
export interface LifecycleSlice {
  relaunchApp: () => Promise<void>;
  quitApp: () => Promise<void>;
}

export const createLifecycleSlice: StateCreator<LabelState, [], [], LifecycleSlice> = () => ({
  relaunchApp: async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch {
      // Stay put: a pending update applies on the next manual start.
    }
  },

  quitApp: async () => {
    try {
      const { exit } = await import('@tauri-apps/plugin-process');
      await exit(0);
    } catch {
      // Nothing to do: the window stays open if the runtime declines to exit.
    }
  },
});
