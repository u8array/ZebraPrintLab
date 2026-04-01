import { create } from 'zustand';
import { temporal } from 'zundo';
import type { LabelConfig, LabelObject } from '../types/ObjectType';

interface LabelState {
  label: LabelConfig;
  objects: LabelObject[];
  selectedId: string | null;

  addObject: (type: string) => void;
  updateObject: (id: string, changes: Partial<LabelObject>) => void;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  setLabelConfig: (config: Partial<LabelConfig>) => void;
}

export const useLabelStore = create<LabelState>()(
  temporal((set) => ({
    label: { widthMm: 100, heightMm: 60, dpmm: 8 },
    objects: [],
    selectedId: null,

    addObject: (_type: string) => {
      // TODO
    },
    updateObject: (_id: string, _changes: Partial<LabelObject>) => {
      // TODO
    },
    removeObject: (_id: string) => {
      // TODO
    },
    selectObject: (id) => set({ selectedId: id }),
    setLabelConfig: (config) =>
      set((state) => ({ label: { ...state.label, ...config } })),
  }))
);
