import { create, useStore } from 'zustand';
import { temporal } from 'zundo';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { LabelConfig, LabelObjectBase } from '../types/ObjectType';
import type { Unit } from '../lib/units';
import { ObjectRegistry } from '../registry';
import type { LabelObject } from '../registry';
import { locales } from '../locales';
import type { LocaleCode } from '../locales';

// Clipboard lives outside Zustand state — no persistence, no undo
let _clipboard: LabelObject[] = [];
let _pasteCount = 0;

function detectLocale(): LocaleCode {
  const lang = navigator.language.slice(0, 2).toLowerCase();
  return (lang in locales ? lang : 'en') as LocaleCode;
}

export interface CanvasSettings {
  showGrid: boolean;
  snapEnabled: boolean;
  snapSizeMm: number;
  zoom: number;
  unit: Unit;
}

interface LabelState {
  label: LabelConfig;
  objects: LabelObject[];
  selectedIds: string[];
  locale: LocaleCode;
  canvasSettings: CanvasSettings;

  addObject: (type: string, position?: { x: number; y: number }) => void;
  updateObject: (id: string, changes: Partial<Omit<LabelObjectBase, 'id' | 'type'>> & { props?: object }) => void;
  removeObject: (id: string) => void;
  duplicateObject: (id: string) => void;
  duplicateSelectedObjects: () => void;
  copySelectedObjects: () => void;
  pasteObjects: () => void;
  selectObject: (id: string | null) => void;
  toggleSelectObject: (id: string) => void;
  selectObjects: (ids: string[]) => void;
  removeSelectedObjects: () => void;
  setLabelConfig: (config: Partial<LabelConfig>) => void;
  setLocale: (locale: LocaleCode) => void;
  setCanvasSettings: (settings: Partial<CanvasSettings>) => void;
  loadDesign: (label: LabelConfig, objects: LabelObject[]) => void;
  moveObjectForward: (id: string) => void;
  moveObjectBackward: (id: string) => void;
  moveObjectToFront: (id: string) => void;
  moveObjectToBack: (id: string) => void;
  reorderObject: (id: string, toIndex: number) => void;
}

export const useLabelStore = create<LabelState>()(
  temporal(
    persist(
    (set) => ({
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      objects: [],
      selectedIds: [],
      locale: detectLocale(),
      canvasSettings: { showGrid: true, snapEnabled: true, snapSizeMm: 1, zoom: 1, unit: 'mm' },

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
          selectedIds: [obj.id],
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
          selectedIds: state.selectedIds.filter((s) => s !== id),
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
          return { objects: [...state.objects, copy], selectedIds: [copy.id] };
        }),

      duplicateSelectedObjects: () =>
        set((state) => {
          if (state.selectedIds.length === 0) return {};
          const copies: LabelObject[] = state.selectedIds.flatMap((id) => {
            const src = state.objects.find((o) => o.id === id);
            if (!src) return [];
            return [{ ...src, id: crypto.randomUUID(), x: src.x + 20, y: src.y + 20 } as LabelObject];
          });
          return { objects: [...state.objects, ...copies], selectedIds: copies.map((c) => c.id) };
        }),

      copySelectedObjects: () => {
        const { selectedIds, objects } = useLabelStore.getState();
        _clipboard = selectedIds.flatMap((id) => {
          const obj = objects.find((o) => o.id === id);
          return obj ? [{ ...obj, props: { ...obj.props } } as LabelObject] : [];
        });
        _pasteCount = 0;
      },

      pasteObjects: () =>
        set((state) => {
          if (_clipboard.length === 0) return {};
          _pasteCount += 1;
          const offset = _pasteCount * 20;
          const copies: LabelObject[] = _clipboard.map((src) => ({
            ...src,
            id: crypto.randomUUID(),
            x: src.x + offset,
            y: src.y + offset,
          } as LabelObject));
          return { objects: [...state.objects, ...copies], selectedIds: copies.map((c) => c.id) };
        }),

      selectObject: (id) => set({ selectedIds: id ? [id] : [] }),

      toggleSelectObject: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((s) => s !== id)
            : [...state.selectedIds, id],
        })),

      selectObjects: (ids) => set({ selectedIds: ids }),

      removeSelectedObjects: () =>
        set((state) => ({
          objects: state.objects.filter((o) => !state.selectedIds.includes(o.id)),
          selectedIds: [],
        })),

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

      reorderObject: (id, toIndex) =>
        set((state) => {
          const objs = [...state.objects];
          const fromIndex = objs.findIndex((o) => o.id === id);
          if (fromIndex === -1 || fromIndex === toIndex) return {};
          objs.splice(toIndex, 0, objs.splice(fromIndex, 1)[0]!);
          return { objects: objs };
        }),

      loadDesign: (label, objects) => set({ label, objects, selectedIds: [] }),

      setLabelConfig: (config) =>
        set((state) => ({ label: { ...state.label, ...config } })),

      setLocale: (locale) => set({ locale }),

      setCanvasSettings: (settings) =>
        set((state) => ({ canvasSettings: { ...state.canvasSettings, ...settings } })),
    }),
    {
      name: 'zpl-designer-session',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        label: state.label,
        objects: state.objects,
        locale: state.locale,
        canvasSettings: state.canvasSettings,
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
