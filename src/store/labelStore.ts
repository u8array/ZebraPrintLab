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
// Increments each time duplicateSelectedObjects is called to stagger offsets;
// reset when the user explicitly changes the selection.
let _duplicateCount = 0;

type ObjectChanges = Partial<Omit<LabelObjectBase, 'id' | 'type'>> & { props?: object };

function applyObjectChanges(obj: LabelObject, changes: ObjectChanges): LabelObject {
  return {
    ...obj,
    ...changes,
    props: changes.props ? Object.assign({}, obj.props, changes.props) : obj.props,
  } as LabelObject;
}

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
  updateObject: (id: string, changes: ObjectChanges) => void;
  updateObjects: (updates: { id: string; changes: ObjectChanges }[]) => void;
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
    (set, get) => ({
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      objects: [],
      selectedIds: [],
      locale: detectLocale(),
      canvasSettings: { showGrid: false, snapEnabled: false, snapSizeMm: 1, zoom: 1, unit: 'mm' },

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
          objects: state.objects.map((obj) => obj.id === id ? applyObjectChanges(obj, changes) : obj),
        })),

      updateObjects: (updates) =>
        set((state) => {
          const updateMap = new Map(updates.map((u) => [u.id, u.changes]));
          return {
            objects: state.objects.map((obj) => {
              const changes = updateMap.get(obj.id);
              return changes ? applyObjectChanges(obj, changes) : obj;
            }),
          };
        }),

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
          _duplicateCount += 1;
          const offset = _duplicateCount * 20;
          const copies: LabelObject[] = state.selectedIds.flatMap((id) => {
            const src = state.objects.find((o) => o.id === id);
            if (!src) return [];
            return [{ ...src, id: crypto.randomUUID(), x: src.x + offset, y: src.y + offset } as LabelObject];
          });
          return { objects: [...state.objects, ...copies], selectedIds: copies.map((c) => c.id) };
        }),

      copySelectedObjects: () => {
        const { selectedIds, objects } = get();
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

      selectObject: (id) => {
        _duplicateCount = 0;
        set({ selectedIds: id ? [id] : [] });
      },

      toggleSelectObject: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((s) => s !== id)
            : [...state.selectedIds, id],
        })),

      selectObjects: (ids) => {
        _duplicateCount = 0;
        set({ selectedIds: ids });
      },

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
          const [moved] = objs.splice(idx, 1);
          if (moved) objs.push(moved);
          return { objects: objs };
        }),

      moveObjectToBack: (id) =>
        set((state) => {
          const idx = state.objects.findIndex((o) => o.id === id);
          if (idx <= 0) return {};
          const objs = [...state.objects];
          const [moved] = objs.splice(idx, 1);
          if (moved) objs.unshift(moved);
          return { objects: objs };
        }),

      moveObjectForward: (id) =>
        set((state) => {
          const idx = state.objects.findIndex((o) => o.id === id);
          if (idx === -1 || idx === state.objects.length - 1) return {};
          const objs = [...state.objects];
          const tmp = objs[idx + 1] as LabelObject;
          objs[idx + 1] = objs[idx] as LabelObject;
          objs[idx] = tmp;
          return { objects: objs };
        }),

      moveObjectBackward: (id) =>
        set((state) => {
          const idx = state.objects.findIndex((o) => o.id === id);
          if (idx <= 0) return {};
          const objs = [...state.objects];
          const tmp = objs[idx - 1] as LabelObject;
          objs[idx - 1] = objs[idx] as LabelObject;
          objs[idx] = tmp;
          return { objects: objs };
        }),

      reorderObject: (id, toIndex) =>
        set((state) => {
          const objs = [...state.objects];
          const fromIndex = objs.findIndex((o) => o.id === id);
          if (fromIndex === -1 || fromIndex === toIndex) return {};
          const [item] = objs.splice(fromIndex, 1);
          if (item) objs.splice(toIndex, 0, item);
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
