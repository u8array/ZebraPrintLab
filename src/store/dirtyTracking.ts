import type { StateCreator, StoreMutatorIdentifier } from 'zustand';
import { isGroup, type LabelObject, type Page } from '../types/Group';
import { EMIT_AFFECTING_KEYS } from './labelStore.internals';

// Centralizes round-trip dirty-tracking that was otherwise scattered across every
// object mutator (the chokepoint plus each wholesale-rewrite bypass). A single
// state-diff stamps `dirty` whenever an object's emitted ZPL bytes change, so the
// overlay regenerates it instead of replaying stale source. Wired as
// temporal(dirtyTracking(persist(...))): it wraps persist and is wrapped by
// temporal, so zundo's restore path (which replays via the original setState,
// outside this wrapper) does not re-stamp on undo/redo.

/** True when any emit-affecting field differs. Scalars compare by value; `props`
 *  compares by reference. Given the store's identity-preserving mutators (which
 *  keep the same `props` object when nothing changed and produce a fresh one on
 *  an edit), this never UNDER-stamps; it can only over-stamp on a no-op props
 *  rebuild, which merely regenerates a byte-identical field. Reuses the single
 *  EMIT_AFFECTING_KEYS source. */
function emitAffectingChanged(a: LabelObject, b: LabelObject): boolean {
  for (const k of EMIT_AFFECTING_KEYS) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return true;
  }
  return false;
}

function indexLeaves(objects: LabelObject[], out: Map<string, LabelObject>): void {
  for (const o of objects) {
    if (isGroup(o)) indexLeaves(o.children, out);
    else out.set(o.id, o);
  }
}

/** Return `nextPages` with `dirty` stamped on any leaf whose emit-affecting
 *  fields changed versus its same-id counterpart in `prevPages`. Identity-
 *  preserving: untouched subtrees keep their references. */
export function stampDirtyLeaves(prevPages: Page[], nextPages: Page[]): Page[] {
  const prev = new Map<string, LabelObject>();
  for (const p of prevPages) indexLeaves(p.objects, prev);

  const stamp = (objects: LabelObject[]): LabelObject[] => {
    let changed = false;
    const next = objects.map((o) => {
      if (isGroup(o)) {
        const kids = stamp(o.children);
        if (kids === o.children) return o;
        changed = true;
        return { ...o, children: kids };
      }
      if (o.dirty) return o;
      const before = prev.get(o.id);
      // New object (no prior) or untouched reference: nothing to stamp.
      if (!before || before === o) return o;
      if (!emitAffectingChanged(before, o)) return o;
      changed = true;
      return { ...o, dirty: true };
    });
    return changed ? next : objects;
  };

  let pagesChanged = false;
  const stamped = nextPages.map((p) => {
    const objs = stamp(p.objects);
    if (objs === p.objects) return p;
    pagesChanged = true;
    return { ...p, objects: objs };
  });
  return pagesChanged ? stamped : nextPages;
}

/** zustand middleware: stamp dirty on emit-affecting object changes in one place.
 *  Mutator-preserving pass-through (adds no store type). Only the `set` injected
 *  into slices is wrapped; a direct `useLabelStore.setState` would bypass
 *  stamping, but all production mutations go through slice actions. */
export const dirtyTracking = (<T extends { pages: Page[] }>(
  initializer: StateCreator<T, [], []>,
): StateCreator<T, [], []> =>
  (set, get, api) => {
    // The `set` casts below are standard middleware boilerplate (the mutated
    // partial is opaque to the wrapped set's overloads). `stamped` is still
    // statically Page[] from stampDirtyLeaves' return type, so the page payload
    // stays type-checked.
    const stampingSet: typeof set = (partial, replace?: boolean) => {
      const prevPages = get().pages;
      const patch = typeof partial === 'function' ? (partial as (s: T) => Partial<T>)(get()) : partial;
      if (patch && typeof patch === 'object' && 'pages' in patch) {
        const nextPages = (patch as { pages?: Page[] }).pages;
        if (nextPages && nextPages !== prevPages) {
          const stamped = stampDirtyLeaves(prevPages, nextPages);
          if (stamped !== nextPages) {
            return (set as (p: unknown, r?: boolean) => void)({ ...patch, pages: stamped }, replace);
          }
        }
      }
      return (set as (p: unknown, r?: boolean) => void)(patch, replace);
    };
    return initializer(stampingSet, get, api);
  }) as <T extends { pages: Page[] }, Mps extends [StoreMutatorIdentifier, unknown][] = [], Mcs extends [StoreMutatorIdentifier, unknown][] = []>(
    initializer: StateCreator<T, Mps, Mcs>,
  ) => StateCreator<T, Mps, Mcs>;
