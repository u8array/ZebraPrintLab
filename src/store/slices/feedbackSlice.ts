import type { StateCreator } from 'zustand';
import type { LabelState } from '../labelStore';

/** Single most-recent-wins error channel instead of a slot per action, so each
 *  new fallible action is just one setUserError call. */
export interface UserError {
  message: string;
  /** Offer the Export-ZPL fallback (only the Labelary print path sets it). */
  retryExport: boolean;
}

export interface FeedbackSlice {
  userError: UserError | null;
  setUserError: (message: string, opts?: { retryExport?: boolean }) => void;
  clearUserError: () => void;
}

export const createFeedbackSlice: StateCreator<LabelState, [], [], FeedbackSlice> = (set) => ({
  userError: null,
  setUserError: (message, opts) =>
    set({ userError: { message, retryExport: opts?.retryExport ?? false } }),
  clearUserError: () => set({ userError: null }),
});
