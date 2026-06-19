import type { LeafObject } from '../registry/leafObject';
import type { LabelObjectBase } from './LabelObject';
export type { LeafObject };
/** Non-leaf container; cascades lock/visibility/inclusion. Intentionally
 *  outside the registry (no toZPL/defaultSize/PropertiesPanel). */
export type GroupObject = LabelObjectBase & {
  type: 'group';
  children: LabelObject[];
};

/** Tree node: leaf or group. Lives here (not in registry) to break the
 *  registry <-> types cycle. */
export type LabelObject = LeafObject | GroupObject;

export interface Page {
  objects: LabelObject[];
}

export function isGroup(obj: LabelObject): obj is GroupObject {
  return obj.type === 'group';
}

/** DFS yielding parent before children, in render order. */
export function* walkObjects(objects: LabelObject[]): Iterable<LabelObject> {
  for (const obj of objects) {
    yield obj;
    if (isGroup(obj)) {
      yield* walkObjects(obj.children);
    }
  }
}

/** Flat list of every leaf descendant of `objects`. Skips group nodes themselves. */
export function getAllLeaves(objects: LabelObject[]): LeafObject[] {
  const out: LeafObject[] = [];
  for (const obj of walkObjects(objects)) {
    if (!isGroup(obj)) out.push(obj);
  }
  return out;
}

/** Find a node by id anywhere in the tree, or undefined if not present. */
export function findObjectById(
  objects: LabelObject[],
  id: string,
): LabelObject | undefined {
  for (const obj of walkObjects(objects)) {
    if (obj.id === id) return obj;
  }
  return undefined;
}

/** Group ancestors outermost-first; empty for top-level or missing. */
export function findAncestors(
  objects: LabelObject[],
  id: string,
): GroupObject[] {
  const trail: GroupObject[] = [];
  const visit = (nodes: LabelObject[]): boolean => {
    for (const n of nodes) {
      if (n.id === id) return true;
      if (isGroup(n)) {
        trail.push(n);
        if (visit(n.children)) return true;
        trail.pop();
      }
    }
    return false;
  };
  visit(objects);
  return trail;
}

/** Figma auto-select-parent: outermost group containing `id`, else `id`. */
export function selectionTargetId(objects: LabelObject[], id: string): string {
  return findAncestors(objects, id)[0]?.id ?? id;
}

/** Identity-preserving: unaffected subtrees keep their original references. */
export function mapObjectById(
  objects: LabelObject[],
  id: string,
  mapper: (obj: LabelObject) => LabelObject,
): LabelObject[] {
  let changed = false;
  const next = objects.map((o) => {
    if (o.id === id) {
      const updated = mapper(o);
      if (updated !== o) changed = true;
      return updated;
    }
    if (isGroup(o)) {
      const nextChildren = mapObjectById(o.children, id, mapper);
      if (nextChildren !== o.children) {
        changed = true;
        return { ...o, children: nextChildren };
      }
    }
    return o;
  });
  return changed ? next : objects;
}

/** Identity-preserving clear of matching variableId across the tree. */
export function stripVariableIdFromObjects(
  objects: LabelObject[],
  variableId: string,
): LabelObject[] {
  let changed = false;
  const next = objects.map((o) => {
    if (isGroup(o)) {
      const newChildren = stripVariableIdFromObjects(o.children, variableId);
      if (newChildren === o.children) return o;
      changed = true;
      return { ...o, children: newChildren };
    }
    if (o.variableId !== variableId) return o;
    changed = true;
    const cleared: LabelObject = { ...o };
    delete cleared.variableId;
    return cleared;
  });
  return changed ? next : objects;
}

/** Returns tree with `id` removed plus the removed node (or null). */
export function detachObjectById(
  objects: LabelObject[],
  id: string,
): { removed: LabelObject | null; rest: LabelObject[] } {
  let removed: LabelObject | null = null;
  const visit = (nodes: LabelObject[]): LabelObject[] => {
    const out: LabelObject[] = [];
    for (const n of nodes) {
      if (n.id === id) {
        removed = n;
        continue;
      }
      if (isGroup(n)) out.push({ ...n, children: visit(n.children) });
      else out.push(n);
    }
    return out;
  };
  const rest = visit(objects);
  return { removed, rest };
}

/** Reparent cycle guard. */
export function isSelfOrDescendant(
  objects: LabelObject[],
  id: string,
  ancestorId: string,
): boolean {
  const node = findObjectById(objects, id);
  if (!node) return false;
  for (const n of walkObjects([node])) {
    if (n.id === ancestorId) return true;
  }
  return false;
}

/** True when groupSelection() would act (>=1 top-level unlocked). */
export function canGroupSelection(
  objects: LabelObject[],
  selectedIds: readonly string[],
): boolean {
  return selectedIds.some((id) =>
    objects.some((o) => o.id === id && !o.locked),
  );
}

/** True when removeSelectedObjects() would act (>=1 top-level unlocked). */
export function canDeleteSelection(
  objects: LabelObject[],
  selectedIds: readonly string[],
): boolean {
  return selectedIds.some((id) =>
    objects.some((o) => o.id === id && !o.locked),
  );
}

/** True when ungroup() would act: a selected top-level object is an unlocked
 *  group. The lock check mirrors ungroupIds, which skips locked groups. */
export function canUngroupSelection(
  objects: LabelObject[],
  selectedIds: readonly string[],
): boolean {
  return objects.some(
    (o) => selectedIds.includes(o.id) && isGroup(o) && !o.locked,
  );
}

/** True when the selection is non-empty and every selected top-level object
 *  is locked; drives the lock/unlock toggle direction. */
export function isSelectionLocked(
  objects: LabelObject[],
  selectedIds: readonly string[],
): boolean {
  if (selectedIds.length === 0) return false;
  return selectedIds.every((id) =>
    objects.some((o) => o.id === id && !!o.locked),
  );
}

/** Expand group ids to their descendant leaves; leaf ids pass through. */
export function expandSelection(
  objects: LabelObject[],
  selectedIds: readonly string[],
): string[] {
  const byId = new Map<string, LabelObject>();
  for (const n of walkObjects(objects)) byId.set(n.id, n);
  const out: string[] = [];
  for (const id of selectedIds) {
    const node = byId.get(id);
    if (!node) continue;
    if (isGroup(node)) {
      for (const leaf of getAllLeaves(node.children)) out.push(leaf.id);
    } else {
      out.push(id);
    }
  }
  return out;
}
