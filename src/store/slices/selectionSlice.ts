import type { StateCreator } from 'zustand';
import { selectPreviewLocksEditor, currentObjects } from '../labelStore.selectors';
import type { LabelState } from '../labelStore';
import { updateCurrentObjects } from '../labelStore.internals';

export interface SelectionSlice {
  selectedIds: string[];
  selectObject: (id: string | null) => void;
  toggleSelectObject: (id: string) => void;
  selectObjects: (ids: string[]) => void;
  /** Delete every non-locked selected object on the current page;
   *  locked items survive and remain selected so the user can see what
   *  the Delete keystroke spared. Cross-writes pages; owned by
   *  objectSlice but the trigger lives with the selection it acts on. */
  removeSelectedObjects: () => void;
}

export const createSelectionSlice: StateCreator<LabelState, [], [], SelectionSlice> = (set) => ({
  selectedIds: [],

  selectObject: (id) =>
    set((state) => {
      const next = id ? [id] : [];
      const same =
        state.selectedIds.length === next.length &&
        state.selectedIds[0] === next[0];
      if (same) return {};
      return { selectedIds: next };
    }),

  toggleSelectObject: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((s) => s !== id)
        : [...state.selectedIds, id],
    })),

  selectObjects: (ids) =>
    set((state) => {
      const same =
        state.selectedIds.length === ids.length &&
        state.selectedIds.every((id, i) => id === ids[i]);
      if (same) return {};
      return { selectedIds: ids };
    }),

  removeSelectedObjects: () =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      const sel = new Set(state.selectedIds);
      const objs = currentObjects(state);
      const lockedIds = objs.flatMap((o) => sel.has(o.id) && o.locked ? [o.id] : []);
      return {
        ...updateCurrentObjects(state, (curr) =>
          curr.filter((o) => !sel.has(o.id) || o.locked),
        ),
        selectedIds: lockedIds,
      };
    }),
});
