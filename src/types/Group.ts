import type { LabelObject } from '../registry';
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
export function getAllLeaves(objects: LabelObject[]): LabelObject[] {
  const out: LabelObject[] = [];
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
 * leaves nested inside groups. Unmatched leaves keep their object
 * identity so per-object React memoisation still works.
 */
export function mapObjectById(
  objects: LabelObject[],
  id: string,
  mapper: (obj: LabelObject) => LabelObject,
): LabelObject[] {
  return objects.map((o) => {
    if (o.id === id) return mapper(o);
    if (isGroup(o)) return { ...o, children: mapObjectById(o.children, id, mapper) };
    return o;
  });
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
