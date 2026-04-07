import { create, useStore } from 'zustand';
import { temporal } from 'zundo';
import type { LabelConfig, LabelObject } from '../types/ObjectType';
import { ObjectRegistry } from '../registry';

interface LabelState {
  label: LabelConfig;
  objects: LabelObject[];
  selectedId: string | null;

  addObject: (type: string, position?: { x: number; y: number }) => void;
  updateObject: (id: string, changes: Partial<LabelObject>) => void;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  setLabelConfig: (config: Partial<LabelConfig>) => void;
}

export const useLabelStore = create<LabelState>()(
  temporal(
    (set) => ({
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      objects: [],
      selectedId: null,

      addObject: (type, position = { x: 50, y: 50 }) => {
        const definition = ObjectRegistry[type];
        if (!definition) return;

        const obj: LabelObject = {
          id: crypto.randomUUID(),
          type,
          x: position.x,
          y: position.y,
          rotation: 0,
          props: { ...definition.defaultProps },
        };

        set((state) => ({
          objects: [...state.objects, obj],
          selectedId: obj.id,
        }));
      },

      updateObject: (id, changes) =>
        set((state) => ({
          objects: state.objects.map((obj) => {
            if (obj.id !== id) return obj;
            return {
              ...obj,
              ...changes,
              // merge props, not replace
              props: changes.props
                ? Object.assign({}, obj.props, changes.props)
                : obj.props,
            };
          }),
        })),

      removeObject: (id) =>
        set((state) => ({
          objects: state.objects.filter((obj) => obj.id !== id),
          selectedId: state.selectedId === id ? null : state.selectedId,
        })),

      selectObject: (id) => set({ selectedId: id }),

      setLabelConfig: (config) =>
        set((state) => ({ label: { ...state.label, ...config } })),
    }),
    {
      // exclude selectedId from undo history
      partialize: (state) => ({
        label: state.label,
        objects: state.objects,
      }),
    }
  )
);

// Undo / redo
export const useHistory = () => useStore(useLabelStore.temporal);
