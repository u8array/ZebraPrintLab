import type { StateCreator } from 'zustand';
import type { DbProfile } from '../../lib/db';
import type { LabelState } from '../labelStore';

export interface DbSlice {
  dbProfiles: DbProfile[];

  addDbProfile: (profile: DbProfile) => void;
  /** Full replace keyed by `profile.id` (partial patches don't compose with
   *  the driver-discriminated union). */
  updateDbProfile: (profile: DbProfile) => void;
  removeDbProfile: (id: string) => void;
}

export const createDbSlice: StateCreator<LabelState, [], [], DbSlice> = (set) => ({
  dbProfiles: [],

  addDbProfile: (profile) =>
    set((state) => ({ dbProfiles: [...state.dbProfiles, profile] })),

  updateDbProfile: (profile) =>
    set((state) => ({
      dbProfiles: state.dbProfiles.map((p) => (p.id === profile.id ? profile : p)),
    })),

  removeDbProfile: (id) =>
    set((state) => ({ dbProfiles: state.dbProfiles.filter((p) => p.id !== id) })),
});
