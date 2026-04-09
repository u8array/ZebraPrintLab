import { create, useStore } from 'zustand';
import { temporal } from 'zundo';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { LabelConfig, LabelObjectBase } from '../types/ObjectType';
import { ObjectRegistry } from '../registry';
import type { LabelObject } from '../registry';

interface LabelState {
  label: LabelConfig;
  objects: LabelObject[];
  selectedId: string | null;

  addObject: (type: string, position?: { x: number; y: number }) => void;
  updateObject: (id: string, changes: Partial<Omit<LabelObjectBase, 'id' | 'type'>> & { props?: object }) => void;
  removeObject: (id: string) => void;
  duplicateObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  setLabelConfig: (config: Partial<LabelConfig>) => void;
  loadDesign: (label: LabelConfig, objects: LabelObject[]) => void;
  moveObjectForward: (id: string) => void;
  moveObjectBackward: (id: string) => void;
  moveObjectToFront: (id: string) => void;
  moveObjectToBack: (id: string) => void;
}

export const useLabelStore = create<LabelState>()(
  temporal(
    persist(
    (set) => ({
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      objects: [],
      selectedId: null,

      addObject: (type, position = { x: 50, y: 50 }) => {
        const definition = ObjectRegistry[type];
        if (!definition) return;

        const obj = {
          id: crypto.randomUUID(),
          type,
          x: position.x,
          y: position.y,
          rotation: 0,
          props: { ...definition.defaultProps },
        } as LabelObject;

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
            } as LabelObject;
          }),
        })),

      removeObject: (id) =>
        set((state) => ({
          objects: state.objects.filter((obj) => obj.id !== id),
          selectedId: state.selectedId === id ? null : state.selectedId,
        })),

      duplicateObject: (id) =>
        set((state) => {
          const src = state.objects.find((o) => o.id === id);
          if (!src) return {};
          const copy: LabelObject = {
            ...src,
            id: crypto.randomUUID(),
            x: src.x + 20,
            y: src.y + 20,
          };
          return { objects: [...state.objects, copy], selectedId: copy.id };
        }),

      selectObject: (id) => set({ selectedId: id }),

      moveObjectToFront: (id) =>
        set((state) => {
          const idx = state.objects.findIndex((o) => o.id === id);
          if (idx === -1 || idx === state.objects.length - 1) return {};
          const objs = [...state.objects];
          objs.push(objs.splice(idx, 1)[0]!);
          return { objects: objs };
        }),

      moveObjectToBack: (id) =>
        set((state) => {
          const idx = state.objects.findIndex((o) => o.id === id);
          if (idx <= 0) return {};
          const objs = [...state.objects];
          objs.unshift(objs.splice(idx, 1)[0]!);
          return { objects: objs };
        }),

      moveObjectForward: (id) =>
        set((state) => {
          const idx = state.objects.findIndex((o) => o.id === id);
          if (idx === -1 || idx === state.objects.length - 1) return {};
          const objs = [...state.objects];
          [objs[idx], objs[idx + 1]] = [objs[idx + 1]!, objs[idx]!];
          return { objects: objs };
        }),

      moveObjectBackward: (id) =>
        set((state) => {
          const idx = state.objects.findIndex((o) => o.id === id);
          if (idx <= 0) return {};
          const objs = [...state.objects];
          [objs[idx], objs[idx - 1]] = [objs[idx - 1]!, objs[idx]!];
          return { objects: objs };
        }),

      loadDesign: (label, objects) => set({ label, objects, selectedId: null }),

      setLabelConfig: (config) =>
        set((state) => ({ label: { ...state.label, ...config } })),
    }),
    {
      name: 'zpl-designer-session',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        label: state.label,
        objects: state.objects,
      }),
    }
    ),
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
