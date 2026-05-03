import { create, useStore } from 'zustand';
import { temporal } from 'zundo';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { LabelConfig, ObjectChanges } from '../types/ObjectType';
import type { Unit } from '../lib/units';
import type { ViewRotation } from '../components/Canvas/rotationGeometry';
import { ObjectRegistry } from '../registry';
import type { LabelObject } from '../registry';
import { locales } from '../locales';
import type { LocaleCode } from '../locales';

export type { ObjectChanges };

export interface Page {
  objects: LabelObject[];
}

function applyObjectChanges(obj: LabelObject, changes: ObjectChanges): LabelObject {
  const normalize = ObjectRegistry[obj.type]?.normalizeChanges;
  const normalized = normalize ? normalize(obj, changes) : changes;
  return {
    ...obj,
    ...normalized,
    props: normalized.props ? Object.assign({}, obj.props, normalized.props) : obj.props,
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
  viewRotation: ViewRotation;
}

interface LabelState {
  label: LabelConfig;
  pages: Page[];
  currentPageIndex: number;
  selectedIds: string[];
  locale: LocaleCode;
  canvasSettings: CanvasSettings;

  clipboard: LabelObject[];
  pasteCount: number;
  duplicateCount: number;

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
  loadDesign: (label: LabelConfig, pages: Page[]) => void;
  moveObjectForward: (id: string) => void;
  moveObjectBackward: (id: string) => void;
  moveObjectToFront: (id: string) => void;
  moveObjectToBack: (id: string) => void;
  reorderObject: (id: string, toIndex: number) => void;

  addPage: () => void;
  removePage: (index: number) => void;
  duplicatePage: (index: number) => void;
  setCurrentPage: (index: number) => void;
}

type PageState = Pick<LabelState, 'pages' | 'currentPageIndex'>;

export const currentObjects = (state: PageState): LabelObject[] =>
  state.pages[state.currentPageIndex]?.objects ?? [];

function updateCurrentObjects(
  state: PageState,
  fn: (objects: LabelObject[]) => LabelObject[]
): Pick<LabelState, 'pages'> {
  return {
    pages: state.pages.map((p, i) =>
      i === state.currentPageIndex ? { ...p, objects: fn(p.objects) } : p
    ),
  };
}

function migrateLegacy(persistedState: unknown): unknown {
  if (!persistedState || typeof persistedState !== 'object') return persistedState;
  const s = persistedState as Record<string, unknown>;
  // v0 stored `objects` at top level; wrap it into a single page.
  if (Array.isArray(s.objects) && !Array.isArray(s.pages)) {
    return {
      ...s,
      pages: [{ objects: s.objects }],
      currentPageIndex: 0,
    };
  }
  return persistedState;
}

export const useLabelStore = create<LabelState>()(
  temporal(
    persist(
    (set, get) => ({
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      pages: [{ objects: [] }],
      currentPageIndex: 0,
      selectedIds: [],
      clipboard: [],
      pasteCount: 0,
      duplicateCount: 0,
      locale: detectLocale(),
      canvasSettings: { showGrid: false, snapEnabled: false, snapSizeMm: 1, zoom: 1, unit: 'mm', viewRotation: 0 },

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
          ...updateCurrentObjects(state, (objs) => [...objs, obj]),
          selectedIds: [obj.id],
        }));
      },

      updateObject: (id, changes) =>
        set((state) =>
          updateCurrentObjects(state, (objs) =>
            objs.map((obj) => obj.id === id ? applyObjectChanges(obj, changes) : obj)
          )
        ),

      updateObjects: (updates) =>
        set((state) => {
          const updateMap = new Map(updates.map((u) => [u.id, u.changes]));
          return updateCurrentObjects(state, (objs) =>
            objs.map((obj) => {
              const changes = updateMap.get(obj.id);
              return changes ? applyObjectChanges(obj, changes) : obj;
            })
          );
        }),

      removeObject: (id) =>
        set((state) => ({
          ...updateCurrentObjects(state, (objs) => objs.filter((obj) => obj.id !== id)),
          selectedIds: state.selectedIds.filter((s) => s !== id),
        })),

      duplicateObject: (id) =>
        set((state) => {
          const objs = currentObjects(state);
          const src = objs.find((o) => o.id === id);
          if (!src) return {};
          const copy: LabelObject = {
            ...src,
            id: crypto.randomUUID(),
            x: src.x + 20,
            y: src.y + 20,
          };
          return {
            ...updateCurrentObjects(state, (curr) => [...curr, copy]),
            selectedIds: [copy.id],
          };
        }),

      duplicateSelectedObjects: () =>
        set((state) => {
          if (state.selectedIds.length === 0) return {};
          const objs = currentObjects(state);
          const duplicateCount = state.duplicateCount + 1;
          const offset = duplicateCount * 20;
          const copies: LabelObject[] = state.selectedIds.flatMap((id) => {
            const src = objs.find((o) => o.id === id);
            if (!src) return [];
            return [{ ...src, id: crypto.randomUUID(), x: src.x + offset, y: src.y + offset } as LabelObject];
          });
          return {
            ...updateCurrentObjects(state, (curr) => [...curr, ...copies]),
            selectedIds: copies.map((c) => c.id),
            duplicateCount,
          };
        }),

      copySelectedObjects: () => {
        const state = get();
        const objs = currentObjects(state);
        const clipboard = state.selectedIds.flatMap((id) => {
          const obj = objs.find((o) => o.id === id);
          return obj ? [{ ...obj, props: { ...obj.props } } as LabelObject] : [];
        });
        set({ clipboard, pasteCount: 0 });
      },

      pasteObjects: () =>
        set((state) => {
          if (state.clipboard.length === 0) return {};
          const pasteCount = state.pasteCount + 1;
          const offset = pasteCount * 20;
          const copies: LabelObject[] = state.clipboard.map((src) => ({
            ...src,
            id: crypto.randomUUID(),
            x: src.x + offset,
            y: src.y + offset,
          } as LabelObject));
          return {
            ...updateCurrentObjects(state, (curr) => [...curr, ...copies]),
            selectedIds: copies.map((c) => c.id),
            pasteCount,
          };
        }),

      selectObject: (id) =>
        set((state) => {
          const next = id ? [id] : [];
          const same =
            state.selectedIds.length === next.length &&
            state.selectedIds[0] === next[0];
          if (same && state.duplicateCount === 0) return {};
          return { selectedIds: next, duplicateCount: 0 };
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
          if (same && state.duplicateCount === 0) return {};
          return { selectedIds: ids, duplicateCount: 0 };
        }),

      removeSelectedObjects: () =>
        set((state) => ({
          ...updateCurrentObjects(state, (objs) => objs.filter((o) => !state.selectedIds.includes(o.id))),
          selectedIds: [],
        })),

      moveObjectToFront: (id) =>
        set((state) => {
          const objs = currentObjects(state);
          const idx = objs.findIndex((o) => o.id === id);
          if (idx === -1 || idx === objs.length - 1) return {};
          return updateCurrentObjects(state, (curr) => {
            const next = [...curr];
            const [moved] = next.splice(idx, 1);
            if (moved) next.push(moved);
            return next;
          });
        }),

      moveObjectToBack: (id) =>
        set((state) => {
          const objs = currentObjects(state);
          const idx = objs.findIndex((o) => o.id === id);
          if (idx <= 0) return {};
          return updateCurrentObjects(state, (curr) => {
            const next = [...curr];
            const [moved] = next.splice(idx, 1);
            if (moved) next.unshift(moved);
            return next;
          });
        }),

      moveObjectForward: (id) =>
        set((state) => {
          const objs = currentObjects(state);
          const idx = objs.findIndex((o) => o.id === id);
          if (idx === -1 || idx === objs.length - 1) return {};
          return updateCurrentObjects(state, (curr) => {
            const next = [...curr];
            const tmp = next[idx + 1] as LabelObject;
            next[idx + 1] = next[idx] as LabelObject;
            next[idx] = tmp;
            return next;
          });
        }),

      moveObjectBackward: (id) =>
        set((state) => {
          const objs = currentObjects(state);
          const idx = objs.findIndex((o) => o.id === id);
          if (idx <= 0) return {};
          return updateCurrentObjects(state, (curr) => {
            const next = [...curr];
            const tmp = next[idx - 1] as LabelObject;
            next[idx - 1] = next[idx] as LabelObject;
            next[idx] = tmp;
            return next;
          });
        }),

      reorderObject: (id, toIndex) =>
        set((state) => {
          const objs = currentObjects(state);
          const fromIndex = objs.findIndex((o) => o.id === id);
          if (fromIndex === -1 || fromIndex === toIndex) return {};
          return updateCurrentObjects(state, (curr) => {
            const next = [...curr];
            const [item] = next.splice(fromIndex, 1);
            if (item) next.splice(toIndex, 0, item);
            return next;
          });
        }),

      loadDesign: (label, pages) =>
        set({
          label,
          pages: pages.length > 0 ? pages : [{ objects: [] }],
          currentPageIndex: 0,
          selectedIds: [],
        }),

      setLabelConfig: (config) =>
        set((state) => ({ label: { ...state.label, ...config } })),

      setLocale: (locale) => set({ locale }),

      setCanvasSettings: (settings) =>
        set((state) => ({ canvasSettings: { ...state.canvasSettings, ...settings } })),

      addPage: () =>
        set((state) => {
          const insertAt = state.currentPageIndex + 1;
          const newPages = [
            ...state.pages.slice(0, insertAt),
            { objects: [] },
            ...state.pages.slice(insertAt),
          ];
          return {
            pages: newPages,
            currentPageIndex: insertAt,
            selectedIds: [],
          };
        }),

      removePage: (index) =>
        set((state) => {
          if (state.pages.length <= 1) return {};
          if (index < 0 || index >= state.pages.length) return {};
          const newPages = state.pages.filter((_, i) => i !== index);
          let newIndex = state.currentPageIndex;
          if (index < state.currentPageIndex) {
            newIndex = state.currentPageIndex - 1;
          } else if (index === state.currentPageIndex) {
            newIndex = Math.min(state.currentPageIndex, newPages.length - 1);
          }
          return {
            pages: newPages,
            currentPageIndex: newIndex,
            selectedIds: [],
          };
        }),

      duplicatePage: (index) =>
        set((state) => {
          if (index < 0 || index >= state.pages.length) return {};
          const source = state.pages[index];
          if (!source) return {};
          const cloned: Page = {
            objects: source.objects.map((o) => ({
              ...o,
              id: crypto.randomUUID(),
              props: { ...o.props },
            } as LabelObject)),
          };
          const insertAt = index + 1;
          const newPages = [
            ...state.pages.slice(0, insertAt),
            cloned,
            ...state.pages.slice(insertAt),
          ];
          return {
            pages: newPages,
            currentPageIndex: insertAt,
            selectedIds: [],
          };
        }),

      setCurrentPage: (index) =>
        set((state) => {
          if (index < 0 || index >= state.pages.length) return {};
          if (index === state.currentPageIndex) return {};
          return { currentPageIndex: index, selectedIds: [] };
        }),
    }),
    {
      name: 'zpl-designer-session',
      version: 1,
      migrate: (persistedState) => migrateLegacy(persistedState) as LabelState,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        label: state.label,
        pages: state.pages,
        currentPageIndex: state.currentPageIndex,
        locale: state.locale,
        canvasSettings: state.canvasSettings,
      }),
    }
    ),
    {
      partialize: (state) => ({
        label: state.label,
        pages: state.pages,
        currentPageIndex: state.currentPageIndex,
      }),
    }
  )
);

export const useCurrentObjects = () => useLabelStore(currentObjects);

// Undo / redo
export const useHistory = () => useStore(useLabelStore.temporal);
