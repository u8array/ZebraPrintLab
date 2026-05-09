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

function detectInitialTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Build-time defaults for third-party services. Vite injects VITE_THIRD_PARTY_*
 *  env values; missing values fall back to enabled. Tauri/Docker builds can flip
 *  the default by setting VITE_THIRD_PARTY_LABELARY=false in their build env. */
function thirdPartyDefaults(): { labelary: boolean } {
  return {
    labelary: import.meta.env.VITE_THIRD_PARTY_LABELARY !== 'false',
  };
}

export interface CanvasSettings {
  showGrid: boolean;
  snapEnabled: boolean;
  snapSizeMm: number;
  zoom: number;
  unit: Unit;
  viewRotation: ViewRotation;
}

export type ThemePreference = 'light' | 'dark';

interface LabelState {
  label: LabelConfig;
  pages: Page[];
  currentPageIndex: number;
  selectedIds: string[];
  locale: LocaleCode;
  /** UI theme. Initial value seeded from prefers-color-scheme; once toggled
   *  the explicit choice persists. */
  theme: ThemePreference;
  canvasSettings: CanvasSettings;
  /** Per-service gates for third-party network calls. Sourced from build-time
   *  env on every load (see thirdPartyDefaults) and intentionally not in
   *  partialize — until a settings UI lets users explicitly opt in/out, the
   *  build is authoritative. */
  thirdParty: { labelary: boolean };
  /** Whether the user has dismissed the one-time Labelary privacy notice. */
  labelaryNoticeAcknowledged: boolean;

  clipboard: LabelObject[];
  pasteCount: number;

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
  setTheme: (theme: ThemePreference) => void;
  setThirdPartyEnabled: (service: 'labelary', enabled: boolean) => void;
  acknowledgeLabelaryNotice: () => void;
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

/** True when a Labelary network call is permitted: the gate is on AND the
 *  user has seen the privacy notice. Kept as a documented invariant; UI
 *  buttons read `thirdParty.labelary` and `labelaryNoticeAcknowledged`
 *  separately because they need to distinguish "hide" (gate off) from
 *  "show notice first" (gate on, not yet acknowledged). */
export const canCallLabelary = (s: LabelState): boolean =>
  s.thirdParty.labelary && s.labelaryNoticeAcknowledged;

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

/** Base offset (in dots) used to stagger duplicate / paste copies so they
 *  don't sit exactly on top of the source. 20 dots ≈ 2.5 mm at 8dpmm —
 *  visible without pushing copies off-canvas. duplicateObject and
 *  duplicateSelectedObjects apply it as a constant (the selection follows
 *  the new copy, so subsequent duplicates stagger naturally); pasteObjects
 *  multiplies it by pasteCount because the clipboard source stays put. */
const DUPLICATE_OFFSET_DOTS = 20;

/** Build offset copies of objects identified by `ids`. Missing ids are
 *  silently dropped. Props are shallow-cloned to match the pattern in
 *  copySelectedObjects — even though no current code path mutates props,
 *  sharing the reference would be a hidden trap for future contributors. */
function buildOffsetCopies(objs: LabelObject[], ids: readonly string[]): LabelObject[] {
  const byId = new Map(objs.map((o) => [o.id, o]));
  return ids.flatMap((id) => {
    const src = byId.get(id);
    if (!src) return [];
    return [{
      ...src,
      id: crypto.randomUUID(),
      x: src.x + DUPLICATE_OFFSET_DOTS,
      y: src.y + DUPLICATE_OFFSET_DOTS,
      props: { ...src.props },
    } as LabelObject];
  });
}

function migrateLegacy(persistedState: unknown, version: number): unknown {
  if (!persistedState || typeof persistedState !== 'object') return persistedState;
  let s = persistedState as Record<string, unknown>;

  // v0→v1: top-level objects array → pages
  if (version < 1 && Array.isArray(s.objects) && !Array.isArray(s.pages)) {
    s = { ...s, pages: [{ objects: s.objects }], currentPageIndex: 0 };
  }

  // v1→v2: viewRotation was added after version 1 shipped; patch it if absent.
  if (version < 2) {
    const cs = s.canvasSettings;
    if (cs && typeof cs === 'object' && !('viewRotation' in cs)) {
      s = { ...s, canvasSettings: { ...(cs as Record<string, unknown>), viewRotation: 0 } };
    }
  }

  return s;
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
      locale: detectLocale(),
      theme: detectInitialTheme(),
      thirdParty: thirdPartyDefaults(),
      labelaryNoticeAcknowledged: false,
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
          const copies = buildOffsetCopies(currentObjects(state), [id]);
          if (copies.length === 0) return {};
          return {
            ...updateCurrentObjects(state, (curr) => [...curr, ...copies]),
            selectedIds: copies.map((c) => c.id),
          };
        }),

      duplicateSelectedObjects: () =>
        set((state) => {
          if (state.selectedIds.length === 0) return {};
          const copies = buildOffsetCopies(currentObjects(state), state.selectedIds);
          return {
            ...updateCurrentObjects(state, (curr) => [...curr, ...copies]),
            selectedIds: copies.map((c) => c.id),
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
          const offset = pasteCount * DUPLICATE_OFFSET_DOTS;
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

      setTheme: (theme) => set({ theme }),

      setThirdPartyEnabled: (service, enabled) =>
        set((state) => ({ thirdParty: { ...state.thirdParty, [service]: enabled } })),

      acknowledgeLabelaryNotice: () => set({ labelaryNoticeAcknowledged: true }),

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
      version: 2,
      migrate: (persistedState, version) => migrateLegacy(persistedState, version) as LabelState,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        label: state.label,
        pages: state.pages,
        currentPageIndex: state.currentPageIndex,
        locale: state.locale,
        theme: state.theme,
        // thirdParty intentionally NOT persisted: until a settings UI lets
        // users explicitly opt in/out, the build-time env (VITE_THIRD_PARTY_*)
        // is authoritative on every load. Persisting now would freeze the
        // first run's env value and quietly defeat later build flips.
        labelaryNoticeAcknowledged: state.labelaryNoticeAcknowledged,
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

/** Non-reactive sibling of `useCurrentObjects` for use inside event handlers
 *  and callbacks where a one-time read is wanted. */
export const getCurrentObjects = (): LabelObject[] =>
  currentObjects(useLabelStore.getState());

// Undo / redo
export const useHistory = () => useStore(useLabelStore.temporal);
