import type { LabelObject, LeafObject } from '../registry';
import type { LabelObjectBase } from './ObjectType';

/**
 * A Group is the only non-leaf node in the object tree. Leaves render and
 * export themselves; groups exist purely as structural containers that
 * cascade lock / visibility / inclusion to their descendants and let the
 * user move, select and reorder a set of objects together.
 *
 * `type: 'group'` is intentionally outside the registry: groups have no
 * `toZPL`, no `defaultSize`, no `PropertiesPanel` — they are handled by
 * tree-walking consumers (render dispatch, ZPL export, layers panel).
 */
export type GroupObject = LabelObjectBase & {
  type: 'group';
  children: LabelObject[];
};

export function isGroup(obj: LabelObject): obj is GroupObject {
  return obj.type === 'group';
}

/**
 * Depth-first walk over a tree of objects. Yields every node (groups and
 * leaves) in render order — children come after their parent so consumers
 * that build z-order arrays can push as they go.
 */
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

/**
 * Returns the chain of group ancestors of the node with `id`, outermost
 * first. Empty when the node is at the top level or not found.
 */
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

/**
 * Resolve the click target for a node hit at `id`: the outermost group
 * containing it, or `id` itself when the node is at the top level. The
 * Figma "auto-select-parent" rule — single click on a child surfaces the
 * group as the unit of interaction.
 */
export function selectionTargetId(objects: LabelObject[], id: string): string {
  return findAncestors(objects, id)[0]?.id ?? id;
}

/**
 * Returns a new tree with the node identified by `id` replaced by
 * `mapper(node)`. Walks recursively into groups so this is the one
 * code path the store needs to mutate either top-level objects or
 * leaves nested inside groups.
 *
 * Identity-preserving: subtrees that don't contain the target id —
 * and the top-level array itself when no match is found — keep their
 * original references. That lets React memoisation skip unaffected
 * branches when a single leaf updates.
 */
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

/**
 * Returns the tree with `id` removed and the removed node, or `null`
 * for the node when nothing matched. Used by reparenting flows that
 * need both the detached node and the tree-without-it.
 */
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

/**
 * True when `ancestorId` is `id` itself or sits anywhere in the
 * subtree rooted at `id`. Reparenting flows use this to forbid the
 * cycle `move(g, into = g_or_descendant_of_g)`.
 */
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

/**
 * True when the current selection has at least one top-level, unlocked
 * item — i.e. when `groupSelection()` would actually act. Used by the
 * "Group" buttons in the layers panel header and the multi-select
 * properties panel so they hide when the click would no-op.
 */
export function canGroupSelection(
  objects: LabelObject[],
  selectedIds: readonly string[],
): boolean {
  return selectedIds.some((id) =>
    objects.some((o) => o.id === id && !o.locked),
  );
}

/**
 * Map an intent-level selection (which may include group ids) to the
 * flat list of Konva-node ids the renderer and transformer can attach
 * to. Group ids expand to their descendant leaves; leaf ids pass
 * through. Order follows the input.
 */
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
