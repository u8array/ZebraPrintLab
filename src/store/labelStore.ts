import { create, useStore } from 'zustand';
import { temporal } from 'zundo';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { LabelConfig, ObjectChanges } from '../types/ObjectType';
import type { Unit } from '../lib/units';
import type { ViewRotation } from '../components/Canvas/rotationGeometry';
import { ObjectRegistry } from '../registry';
import type { LabelObject } from '../registry';
import {
  isGroup,
  mapObjectById,
  detachObjectById,
  findObjectById,
  isSelfOrDescendant,
  type GroupObject,
} from '../types/Group';
import { locales } from '../locales';
import type { LocaleCode } from '../locales';
import { isDefaultLabelaryHost } from '../lib/labelary';

export type { ObjectChanges };

export interface Page {
  objects: LabelObject[];
}

/** Meta fields that remain editable on a locked object so the user can
 *  release the lock or annotate without unlocking first. Everything else
 *  (position, props, rotation, positionType) is blocked. */
const LOCK_BYPASS_KEYS = new Set(['locked', 'visible', 'includeInExport', 'comment', 'name']);

function isLockBypass(changes: ObjectChanges): boolean {
  const keys = Object.keys(changes);
  return keys.length > 0 && keys.every((k) => LOCK_BYPASS_KEYS.has(k));
}

function applyObjectChanges(obj: LabelObject, changes: ObjectChanges): LabelObject {
  if (obj.locked && !isLockBypass(changes)) return obj;
  if (isGroup(obj)) {
    // Groups have no registry entry (no normalize hook) and no props to
    // merge — apply top-level changes only. Children stay untouched;
    // tree updates reach them through their own mapObjectById call.
    return { ...obj, ...changes } as LabelObject;
  }
  const normalize = ObjectRegistry[obj.type]?.normalizeChanges;
  const normalized = normalize ? normalize(obj, changes) : changes;
  return {
    ...obj,
    ...normalized,
    props: normalized.props ? Object.assign({}, obj.props, normalized.props) : obj.props,
  } as LabelObject;
}

/** Immutable insert-at-index that clamps `idx` into the array's bounds.
 *  Used by reparent flows to splice a node into a children list or the
 *  top-level list without crashing on out-of-range indices coming from
 *  ephemeral drag state. */
function insertAt<T>(arr: readonly T[], idx: number, item: T): T[] {
  const clamped = Math.max(0, Math.min(idx, arr.length));
  return [...arr.slice(0, clamped), item, ...arr.slice(clamped)];
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
  /** Wraps every selected top-level, unlocked object in a new GroupObject
   *  at the position of the topmost (last-in-array) selected item.
   *  No-op if fewer than one such object is selected. */
  groupSelection: () => void;
  /** Replaces every selected top-level group with its children, splicing
   *  them in at the group's former index. No-op on non-group selections. */
  ungroup: () => void;
  /** Like `ungroup`, but operates on an explicit id list instead of the
   *  active selection. Used by the layers panel's per-row ungroup
   *  button so the user doesn't have to select the group first. */
  ungroupIds: (ids: readonly string[]) => void;
  /** Move `id` to a new position in the tree. `parentId: null` means the
   *  top level; any other value targets a group. `index` is the
   *  insertion position inside the target's children list. Silently
   *  refuses cycles (moving a group into its own descendant). */
  reparentObject: (id: string, target: { parentId: string | null; index: number }) => void;
  /** Append an empty group at the top level (end of the objects array =
   *  front-most layer = topmost row in the layers panel) and select it.
   *  Lets the user create a group up-front and drag items in afterwards
   *  via the layers panel, instead of having to select-then-shortcut. */
  addGroup: () => void;
  setLabelConfig: (config: Partial<LabelConfig>) => void;
  setLocale: (locale: LocaleCode) => void;
  setTheme: (theme: ThemePreference) => void;
  setThirdPartyEnabled: (service: 'labelary', enabled: boolean) => void;
  acknowledgeLabelaryNotice: () => void;
  setCanvasSettings: (settings: Partial<CanvasSettings>) => void;
  loadDesign: (label: LabelConfig, pages: Page[]) => void;
  appendPages: (pages: Page[]) => void;
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

/** True when clicking a Labelary-backed action must first surface the
 *  privacy notice modal. A custom-host build implies the operator already
 *  controls the endpoint and no third-party disclosure is needed. */
export const selectLabelaryNoticeRequired = (s: LabelState): boolean =>
  isDefaultLabelaryHost() && !s.labelaryNoticeAcknowledged;

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
    // Groups don't carry props and need their children's ids regenerated
    // recursively so the duplicate doesn't collide with the original
    // (mapObjectById would otherwise hit the first match and ignore the
    // second). Leaves: shallow-clone props to avoid sharing the
    // reference with future mutators.
    if (isGroup(src)) {
      return [{
        ...src,
        id: crypto.randomUUID(),
        x: src.x + DUPLICATE_OFFSET_DOTS,
        y: src.y + DUPLICATE_OFFSET_DOTS,
        children: cloneChildrenFresh(src.children),
      }];
    }
    return [{
      ...src,
      id: crypto.randomUUID(),
      x: src.x + DUPLICATE_OFFSET_DOTS,
      y: src.y + DUPLICATE_OFFSET_DOTS,
      props: { ...src.props },
    } as LabelObject];
  });
}

/** Deep-clone a children list with fresh ids and shallow-cloned props on
 *  every leaf. Recurses through nested groups. Used by duplicate flows
 *  so a duplicated subtree has no id collisions with the source. */
function cloneChildrenFresh(children: LabelObject[]): LabelObject[] {
  return children.map((c) => {
    if (isGroup(c)) {
      return {
        ...c,
        id: crypto.randomUUID(),
        children: cloneChildrenFresh(c.children),
      };
    }
    return { ...c, id: crypto.randomUUID(), props: { ...c.props } } as LabelObject;
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
            mapObjectById(objs, id, (obj) => applyObjectChanges(obj, changes)),
          ),
        ),

      updateObjects: (updates) =>
        set((state) => {
          if (updates.length === 0) return {};
          // Single tree walk that applies every queued change in one
          // pass: O(tree) instead of O(updates × tree). Identity-
          // preserving — subtrees with no matching id keep their
          // reference so React memoisation can skip them.
          const updateMap = new Map(updates.map((u) => [u.id, u.changes]));
          const applyUpdates = (nodes: LabelObject[]): LabelObject[] => {
            let changed = false;
            const next = nodes.map((n) => {
              const changes = updateMap.get(n.id);
              let updated = changes ? applyObjectChanges(n, changes) : n;
              if (isGroup(updated)) {
                const nextChildren = applyUpdates(updated.children);
                if (nextChildren !== updated.children) {
                  updated = { ...updated, children: nextChildren };
                }
              }
              if (updated !== n) changed = true;
              return updated;
            });
            return changed ? next : nodes;
          };
          return updateCurrentObjects(state, (objs) => applyUpdates(objs));
        }),

      removeObject: (id) =>
        set((state) => {
          const obj = currentObjects(state).find((o) => o.id === id);
          if (obj?.locked) return {};
          return {
            ...updateCurrentObjects(state, (objs) => objs.filter((o) => o.id !== id)),
            selectedIds: state.selectedIds.filter((s) => s !== id),
          };
        }),

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
          if (!obj) return [];
          if (isGroup(obj)) {
            // Clone children too so a later paste produces an
            // independent subtree (paste regenerates the top-level id
            // but expects descendants ready to be inserted as-is).
            return [{ ...obj, children: cloneChildrenFresh(obj.children) }];
          }
          return [{ ...obj, props: { ...obj.props } } as LabelObject];
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
        set((state) => {
          const sel = new Set(state.selectedIds);
          const objs = currentObjects(state);
          // Locked objects survive a Delete keystroke / bulk-remove; the
          // multi-select clears down to whichever locked items remain.
          const lockedIds = objs.flatMap((o) => sel.has(o.id) && o.locked ? [o.id] : []);
          return {
            ...updateCurrentObjects(state, (curr) =>
              curr.filter((o) => !sel.has(o.id) || o.locked),
            ),
            selectedIds: lockedIds,
          };
        }),

      groupSelection: () =>
        set((state) => {
          const objs = currentObjects(state);
          const sel = new Set(state.selectedIds);
          // Only consider top-level objects of the current page. Nested
          // children of an existing group are out of scope for v1 — the
          // user would have to ungroup the parent first.
          const candidates = objs.flatMap((o) =>
            sel.has(o.id) && !o.locked ? [o] : [],
          );
          if (candidates.length === 0) return {};
          const candidateIds = new Set(candidates.map((o) => o.id));
          // Insert at the position of the last (topmost in z-order)
          // selected item so the group lands where the user's eye is.
          const lastIndex = objs.reduce(
            (acc, o, i) => (candidateIds.has(o.id) ? i : acc),
            -1,
          );
          const group: GroupObject = {
            id: crypto.randomUUID(),
            type: 'group',
            x: 0,
            y: 0,
            rotation: 0,
            children: candidates,
          };
          const remaining = objs.filter((o) => !candidateIds.has(o.id));
          // lastIndex is computed on the pre-filter array; convert it to
          // the post-filter insertion point by counting how many of the
          // removed items were before it.
          const removedBefore = objs
            .slice(0, lastIndex + 1)
            .filter((o) => candidateIds.has(o.id)).length;
          const insertAt = lastIndex + 1 - removedBefore;
          const next = [
            ...remaining.slice(0, insertAt),
            group,
            ...remaining.slice(insertAt),
          ];
          return {
            ...updateCurrentObjects(state, () => next),
            selectedIds: [group.id],
          };
        }),

      reparentObject: (id, target) =>
        set((state) => {
          const objs = currentObjects(state);
          // Forbid cycles: moving a group into itself or one of its
          // descendants would orphan the rest of the tree.
          if (target.parentId && isSelfOrDescendant(objs, id, target.parentId)) {
            return {};
          }
          // Refuse drops into something that isn't a group — the layers
          // panel should never produce this, but a defensive check
          // keeps the model from picking up bogus state if a caller
          // passes a leaf id.
          if (target.parentId !== null) {
            const parent = findObjectById(objs, target.parentId);
            if (!parent || !isGroup(parent)) return {};
          }
          const { removed, rest } = detachObjectById(objs, id);
          if (!removed) return {};
          const node = removed;
          if (target.parentId === null) {
            return updateCurrentObjects(state, () => insertAt(rest, target.index, node));
          }
          const next = mapObjectById(rest, target.parentId, (p) =>
            isGroup(p)
              ? { ...p, children: insertAt(p.children, target.index, node) }
              : p,
          );
          return updateCurrentObjects(state, () => next);
        }),

      addGroup: () =>
        set((state) => {
          const group: GroupObject = {
            id: crypto.randomUUID(),
            type: 'group',
            x: 0,
            y: 0,
            rotation: 0,
            children: [],
          };
          return {
            ...updateCurrentObjects(state, (objs) => [...objs, group]),
            selectedIds: [group.id],
          };
        }),

      ungroup: () => get().ungroupIds(get().selectedIds),

      ungroupIds: (ids) =>
        set((state) => {
          const wanted = new Set(ids);
          const objs = currentObjects(state);
          const targets = objs.flatMap((o) =>
            wanted.has(o.id) && isGroup(o) && !o.locked ? [o] : [],
          );
          if (targets.length === 0) return {};
          const targetIds = new Set(targets.map((g) => g.id));
          const next: LabelObject[] = [];
          const newSelection: string[] = [];
          for (const o of objs) {
            if (targetIds.has(o.id) && isGroup(o)) {
              next.push(...o.children);
              newSelection.push(...o.children.map((c) => c.id));
            } else {
              next.push(o);
            }
          }
          return {
            ...updateCurrentObjects(state, () => next),
            selectedIds: newSelection,
          };
        }),

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

      // Append-mode counterpart to loadDesign: keeps the current label
      // config (the user opted into the existing design's dimensions /
      // dpmm) and just tacks the imported pages onto the end of the
      // page list, switching focus to the first appended page.
      appendPages: (pages) =>
        set((state) => {
          if (pages.length === 0) return {};
          const newPages = [...state.pages, ...pages];
          return {
            pages: newPages,
            currentPageIndex: state.pages.length,
            selectedIds: [],
          };
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
            objects: source.objects.map((o) => {
              if (isGroup(o)) {
                return {
                  ...o,
                  id: crypto.randomUUID(),
                  children: cloneChildrenFresh(o.children),
                };
              }
              return {
                ...o,
                id: crypto.randomUUID(),
                props: { ...o.props },
              } as LabelObject;
            }),
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
