import type { StateCreator } from 'zustand';
import type { ObjectChanges } from '../../types/LabelObject';
import {
  isGroup,
  mapObjectById,
  detachObjectById,
  findObjectById,
  findAncestors,
  isSelfOrDescendant,
  type GroupObject,
  type LabelObject,
  type Page,
} from '../../types/Group';
import { getEntry } from '../../registry';
import {
  applyObjectChanges,
  insertAt,
  DUPLICATE_OFFSET_DOTS,
  buildOffsetCopies,
  cloneChildrenFresh,
  updateCurrentObjects,
} from '../labelStore.internals';
import { selectPreviewLocksEditor, currentObjects } from '../labelStore.selectors';
import type { LabelState } from '../labelStore';

export interface ObjectSlice {
  pages: Page[];
  currentPageIndex: number;
  clipboard: LabelObject[];
  pasteCount: number;

  addObject: (
    type: string,
    position?: { x: number; y: number },
    propsOverride?: object,
  ) => void;
  updateObject: (id: string, changes: ObjectChanges) => void;
  updateObjects: (updates: { id: string; changes: ObjectChanges }[]) => void;
  removeObject: (id: string) => void;
  duplicateObject: (id: string) => void;
  duplicateSelectedObjects: () => void;
  copySelectedObjects: () => void;
  pasteObjects: () => void;
  /** Wraps every selected top-level, unlocked object in a new GroupObject
   *  at the position of the topmost (last-in-array) selected item. */
  groupSelection: () => void;
  /** Replaces every selected top-level group with its children. */
  ungroup: () => void;
  /** Like `ungroup`, but operates on an explicit id list. */
  ungroupIds: (ids: readonly string[]) => void;
  /** Move `id` to a new tree position. `parentId: null` targets top
   *  level; otherwise a group. Silently refuses cycles. */
  reparentObject: (id: string, target: { parentId: string | null; index: number }) => void;
  /** Append an empty group at the top level and select it. */
  addGroup: () => void;

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

export const createObjectSlice: StateCreator<LabelState, [], [], ObjectSlice> = (set, get) => ({
  pages: [{ objects: [] }],
  currentPageIndex: 0,
  clipboard: [],
  pasteCount: 0,

  addObject: (type, position = { x: 50, y: 50 }, propsOverride) => {
    if (selectPreviewLocksEditor(get())) return;
    const definition = getEntry(type);
    if (!definition) return;

    const obj = {
      id: crypto.randomUUID(),
      type,
      x: position.x,
      y: position.y,
      rotation: 0,
      props: { ...definition.defaultProps, ...propsOverride },
    } as LabelObject;

    set((state) => ({
      ...updateCurrentObjects(state, (objs) => [...objs, obj]),
      selectedIds: [obj.id],
    }));
  },

  updateObject: (id, changes) =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      const objs = currentObjects(state);
      const ancestorLocked = findAncestors(objs, id).some((g) => !!g.locked);
      return updateCurrentObjects(state, (curr) =>
        mapObjectById(curr, id, (obj) =>
          applyObjectChanges(obj, changes, ancestorLocked),
        ),
      );
    }),

  updateObjects: (updates) =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      if (updates.length === 0) return {};
      // Single tree walk, identity-preserving; inheritedLocked cascades
      // so leaves in locked groups stay locked without ancestor re-walks.
      const updateMap = new Map(updates.map((u) => [u.id, u.changes]));
      const applyUpdates = (
        nodes: LabelObject[],
        inheritedLocked: boolean,
      ): LabelObject[] => {
        let changed = false;
        const next = nodes.map((n) => {
          const changes = updateMap.get(n.id);
          let updated = changes
            ? applyObjectChanges(n, changes, inheritedLocked)
            : n;
          if (isGroup(updated)) {
            const childLocked = inheritedLocked || !!updated.locked;
            const nextChildren = applyUpdates(updated.children, childLocked);
            if (nextChildren !== updated.children) {
              updated = { ...updated, children: nextChildren };
            }
          }
          if (updated !== n) changed = true;
          return updated;
        });
        return changed ? next : nodes;
      };
      return updateCurrentObjects(state, (objs) => applyUpdates(objs, false));
    }),

  removeObject: (id) =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      const obj = currentObjects(state).find((o) => o.id === id);
      if (obj?.locked) return {};
      return {
        ...updateCurrentObjects(state, (objs) => objs.filter((o) => o.id !== id)),
        selectedIds: state.selectedIds.filter((s) => s !== id),
      };
    }),

  duplicateObject: (id) =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      const copies = buildOffsetCopies(currentObjects(state), [id]);
      if (copies.length === 0) return {};
      return {
        ...updateCurrentObjects(state, (curr) => [...curr, ...copies]),
        selectedIds: copies.map((c) => c.id),
      };
    }),

  duplicateSelectedObjects: () =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      if (state.selectedIds.length === 0) return {};
      const copies = buildOffsetCopies(currentObjects(state), state.selectedIds);
      return {
        ...updateCurrentObjects(state, (curr) => [...curr, ...copies]),
        selectedIds: copies.map((c) => c.id),
      };
    }),

  copySelectedObjects: () => {
    const state = get();
    if (selectPreviewLocksEditor(state)) return;
    const objs = currentObjects(state);
    const clipboard = state.selectedIds.flatMap((id) => {
      const obj = objs.find((o) => o.id === id);
      if (!obj) return [];
      if (isGroup(obj)) {
        return [{ ...obj, children: cloneChildrenFresh(obj.children) }];
      }
      return [{ ...obj, props: { ...obj.props } } as LabelObject];
    });
    set({ clipboard, pasteCount: 0 });
  },

  pasteObjects: () =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
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

  groupSelection: () =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      const objs = currentObjects(state);
      const sel = new Set(state.selectedIds);
      // Only top-level objects of the current page; nested children of an
      // existing group need ungroup first.
      const candidates = objs.flatMap((o) =>
        sel.has(o.id) && !o.locked ? [o] : [],
      );
      if (candidates.length === 0) return {};
      const candidateIds = new Set(candidates.map((o) => o.id));
      // Insert at the position of the last (topmost) selected item so
      // the group lands where the user's eye is.
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
      // lastIndex is pre-filter; convert by counting removed items before it.
      const removedBefore = objs
        .slice(0, lastIndex + 1)
        .filter((o) => candidateIds.has(o.id)).length;
      const insertPos = lastIndex + 1 - removedBefore;
      const next = [
        ...remaining.slice(0, insertPos),
        group,
        ...remaining.slice(insertPos),
      ];
      return {
        ...updateCurrentObjects(state, () => next),
        selectedIds: [group.id],
      };
    }),

  reparentObject: (id, target) =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      const objs = currentObjects(state);
      // Forbid cycles: moving a group into itself or one of its descendants.
      if (target.parentId && isSelfOrDescendant(objs, id, target.parentId)) {
        return {};
      }
      // Refuse drops into non-groups (defensive; layers panel never produces this).
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
      if (selectPreviewLocksEditor(state)) return {};
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
      if (selectPreviewLocksEditor(state)) return {};
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
      if (selectPreviewLocksEditor(state)) return {};
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
      if (selectPreviewLocksEditor(state)) return {};
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
      if (selectPreviewLocksEditor(state)) return {};
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
      if (selectPreviewLocksEditor(state)) return {};
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
      if (selectPreviewLocksEditor(state)) return {};
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

  addPage: () =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      const insertPos = state.currentPageIndex + 1;
      const newPages = [
        ...state.pages.slice(0, insertPos),
        { objects: [] },
        ...state.pages.slice(insertPos),
      ];
      return {
        pages: newPages,
        currentPageIndex: insertPos,
        selectedIds: [],
      };
    }),

  removePage: (index) =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
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
      if (selectPreviewLocksEditor(state)) return {};
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
      const insertPos = index + 1;
      const newPages = [
        ...state.pages.slice(0, insertPos),
        cloned,
        ...state.pages.slice(insertPos),
      ];
      return {
        pages: newPages,
        currentPageIndex: insertPos,
        selectedIds: [],
      };
    }),

  setCurrentPage: (index) =>
    set((state) => {
      if (selectPreviewLocksEditor(state)) return {};
      if (index < 0 || index >= state.pages.length) return {};
      if (index === state.currentPageIndex) return {};
      return { currentPageIndex: index, selectedIds: [] };
    }),
});
