import { isGroup, type LabelObject, type Page } from '../types/Group';
import type { ObjectChanges } from '../types/LabelObject';
import type { LocaleCode } from '../locales';
import { locales } from '../locales';
import { renameTemplateMarker } from '../lib/fnTemplate';
import { getObjectStringContent } from '../lib/variableBinding';
import { getEntry } from '../registry';

/** Meta fields that remain editable on a locked object so the user can
 *  release the lock or annotate without unlocking first. Everything else
 *  (position, props, rotation, positionType) is blocked. */
const LOCK_BYPASS_KEYS = new Set(['locked', 'visible', 'includeInExport', 'comment', 'name']);

export function isLockBypass(changes: ObjectChanges): boolean {
  const keys = Object.keys(changes);
  return keys.length > 0 && keys.every((k) => LOCK_BYPASS_KEYS.has(k));
}

/** Apply `renameTemplateMarker` to every leaf's `content` in a subtree.
 *  Identity-preserving: returns the same array (and same node refs)
 *  when no markers needed rewriting, so React memoisation downstream
 *  stays effective for the common case where the rename touched no
 *  templates. */
export function rewriteTemplateMarkers(
  objects: LabelObject[],
  oldName: string,
  newName: string,
): LabelObject[] {
  let changed = false;
  const next = objects.map((obj) => {
    if (isGroup(obj)) {
      const nextChildren = rewriteTemplateMarkers(obj.children, oldName, newName);
      if (nextChildren === obj.children) return obj;
      changed = true;
      return { ...obj, children: nextChildren };
    }
    const content = getObjectStringContent(obj);
    if (content === undefined) return obj;
    const renamed = renameTemplateMarker(content, oldName, newName);
    if (renamed === content) return obj;
    changed = true;
    const props = (obj as { props: object }).props;
    return { ...obj, props: { ...props, content: renamed } } as LabelObject;
  });
  return changed ? next : objects;
}

export function applyObjectChanges(
  obj: LabelObject,
  changes: ObjectChanges,
  ancestorLocked = false,
): LabelObject {
  // Lock cascades from any ancestor group: a leaf inside a locked group
  // accepts only bypass keys (locked / visible / includeInExport /
  // comment / name) so the user can still toggle visibility or release
  // the lock from the layers panel. Load-bearing — `expandSelection`-
  // driven callers (arrow-key nudges, shift-multi-drag) target the
  // group's leaf children directly and would otherwise sidestep the
  // group's own `locked` flag.
  if ((obj.locked || ancestorLocked) && !isLockBypass(changes)) return obj;
  if (isGroup(obj)) {
    // Groups have no registry entry (no normalize hook) and no props to
    // merge — apply top-level changes only. Children stay untouched;
    // tree updates reach them through their own mapObjectById call.
    return { ...obj, ...changes } as LabelObject;
  }
  const normalize = getEntry(obj.type)?.normalizeChanges;
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
export function insertAt<T>(arr: readonly T[], idx: number, item: T): T[] {
  const clamped = Math.max(0, Math.min(idx, arr.length));
  return [...arr.slice(0, clamped), item, ...arr.slice(clamped)];
}

export function detectLocale(): LocaleCode {
  const lang = navigator.language.slice(0, 2).toLowerCase();
  return (lang in locales ? lang : 'en') as LocaleCode;
}

export function detectInitialTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Build-time defaults for third-party services. Vite injects VITE_THIRD_PARTY_*
 *  env values; missing values fall back to enabled. Tauri/Docker builds can flip
 *  the default by setting VITE_THIRD_PARTY_LABELARY=false in their build env. */
export function thirdPartyDefaults(): { labelary: boolean } {
  return {
    labelary: import.meta.env.VITE_THIRD_PARTY_LABELARY !== 'false',
  };
}

/** Base offset (in dots) used to stagger duplicate / paste copies so they
 *  don't sit exactly on top of the source. 20 dots ≈ 2.5 mm at 8dpmm. */
export const DUPLICATE_OFFSET_DOTS = 20;

/** Deep-clone a children list with fresh ids and shallow-cloned props on
 *  every leaf. Recurses through nested groups. */
export function cloneChildrenFresh(children: LabelObject[]): LabelObject[] {
  return children.map((c) => {
    if (isGroup(c)) {
      return {
        ...c,
        id: crypto.randomUUID(),
        children: cloneChildrenFresh(c.children),
      };
    }
    return {
      ...c,
      id: crypto.randomUUID(),
      props: { ...c.props },
    } as LabelObject;
  });
}

/** Build offset copies of objects identified by `ids`. Missing ids are
 *  silently dropped. Props are shallow-cloned to avoid sharing the
 *  reference with the original. */
export function buildOffsetCopies(objs: LabelObject[], ids: readonly string[]): LabelObject[] {
  const byId = new Map(objs.map((o) => [o.id, o]));
  return ids.flatMap((id) => {
    const src = byId.get(id);
    if (!src) return [];
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

/** Subset of LabelState that paged mutators read. Slices that touch pages
 *  via `set((state) => updateCurrentObjects(state, fn))` use this shape. */
export interface PageState {
  pages: Page[];
  currentPageIndex: number;
}

export function updateCurrentObjects(
  state: PageState,
  fn: (objects: LabelObject[]) => LabelObject[]
): { pages: Page[] } {
  return {
    pages: state.pages.map((p, i) =>
      i === state.currentPageIndex ? { ...p, objects: fn(p.objects) } : p
    ),
  };
}
