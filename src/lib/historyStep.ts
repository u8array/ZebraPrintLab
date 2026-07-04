import type { Page, LeafObject } from "../types/Group";
import { getAllLeaves, walkObjects } from "../types/Group";
import type { Variable } from "../types/Variable";
import type { LabelConfig } from "../types/LabelConfig";

/** The undoable document slice zundo snapshots (mirrors `temporalPartialize`).
 *  Fields are compared by reference: the store is identity-preserving, so an
 *  unchanged domain keeps its ref across snapshots and a changed one gets a new
 *  one. `printerProfile`/`csvMapping` are only ref-compared, hence `unknown`. */
export interface HistorySnapshot {
  label: LabelConfig;
  printerProfile: unknown;
  pages: Page[];
  /** Rides the snapshot so undo/redo restore a valid page index; never the sole
   *  diff between recorded snapshots (page navigation alone is not recorded),
   *  so the classifier does not key off it. */
  currentPageIndex: number;
  variables: readonly Variable[];
  csvMapping: unknown;
}

export type HistoryStepKind =
  | "initial"
  | "add"
  | "remove"
  | "move"
  | "resize"
  | "edit"
  | "group"
  | "reorder"
  | "variable"
  | "csv"
  | "label"
  | "page"
  | "load"
  | "mixed";

/** Locale- and icon-agnostic description of one step. `name` is a single
 *  object's custom name or its registry type id (the UI localizes it). */
export interface HistoryStepDescriptor {
  kind: HistoryStepKind;
  count?: number;
  name?: string;
}

/** Props keys that mean "the object was resized" rather than moved or edited.
 *  Best-effort allowlist across registry types (image dots, line length,
 *  stacked-2D row height included); a size key not listed falls back to edit. */
const DIMENSION_KEYS = [
  "width", "height", "blockWidth", "blockHeight", "blockLines",
  "moduleWidth", "magnification", "fontHeight", "fontWidth",
  "thickness", "dimension", "segments", "rounding",
  "widthDots", "heightDots", "length", "rowHeight",
] as const;

const leavesOf = (pages: Page[]): LeafObject[] => pages.flatMap((p) => getAllLeaves(p.objects));

const nodeIdSet = (pages: Page[]): Set<string> => {
  const ids = new Set<string>();
  for (const p of pages) for (const n of walkObjects(p.objects)) ids.add(n.id);
  return ids;
};

const labelOf = (leaf: LeafObject): string =>
  leaf.name && leaf.name.trim() ? leaf.name : leaf.type;

const dimsDiffer = (a: object, b: object): boolean => {
  const pa = a as Record<string, unknown>;
  const pb = b as Record<string, unknown>;
  return DIMENSION_KEYS.some((k) => pa[k] !== pb[k]);
};

/** Classify one undo step from the delta between two snapshots. A snapshot
 *  can't recover intent, so move/resize/edit is a best-effort heuristic.
 *  Precedence collapses a single action that ripples across domains (e.g. a
 *  variable rename also rewrites page markers) into one kind. */
export function describeHistoryStep(
  prev: HistorySnapshot | null,
  next: HistorySnapshot,
): HistoryStepDescriptor {
  if (!prev) return { kind: "initial" };

  const labelChanged = prev.label !== next.label;
  const profileChanged = prev.printerProfile !== next.printerProfile;
  const pagesChanged = prev.pages !== next.pages;
  const varsChanged = prev.variables !== next.variables;
  const csvChanged = prev.csvMapping !== next.csvMapping;

  // Whole-document replace (loadDesign): label + pages + variables all swap at
  // once. Variable ops never touch `label`, so this can't catch them.
  if (labelChanged && pagesChanged && varsChanged) return { kind: "load" };

  // Variable add/remove/rename ripples into pages + csvMapping; it wins.
  if (varsChanged) {
    const pv = prev.variables;
    const nv = next.variables;
    if (nv.length > pv.length) {
      const added = nv.find((v) => !pv.some((o) => o.id === v.id));
      return { kind: "variable", name: added?.name };
    }
    if (nv.length < pv.length) {
      const removed = pv.find((v) => !nv.some((o) => o.id === v.id));
      return { kind: "variable", name: removed?.name };
    }
    const renamed = nv.find((v) => v !== pv.find((o) => o.id === v.id));
    return { kind: "variable", name: renamed?.name };
  }

  if (csvChanged) return { kind: "csv" };

  if (pagesChanged) {
    const prevLeaves = leavesOf(prev.pages);
    const nextLeaves = leavesOf(next.pages);
    const prevById = new Map(prevLeaves.map((l) => [l.id, l]));
    const nextIds = new Set(nextLeaves.map((l) => l.id));
    const added = nextLeaves.filter((l) => !prevById.has(l.id));
    const removed = prevLeaves.filter((l) => !nextIds.has(l.id));

    const [firstAdded] = added;
    if (firstAdded && !removed.length) {
      return { kind: "add", count: added.length, name: added.length === 1 ? labelOf(firstAdded) : undefined };
    }
    const [firstRemoved] = removed;
    if (firstRemoved && !added.length) {
      return { kind: "remove", count: removed.length, name: removed.length === 1 ? labelOf(firstRemoved) : undefined };
    }
    if (!added.length && !removed.length) {
      // Same leaves: group/ungroup reparents nodes without adding/removing leaves.
      const prevNodes = nodeIdSet(prev.pages);
      const nextNodes = nodeIdSet(next.pages);
      if (prevNodes.size !== nextNodes.size) return { kind: "group" };

      // Identity-preserving store: a leaf with a new ref is the one that changed.
      const changed = nextLeaves
        .map((l) => ({ l, p: prevById.get(l.id) }))
        .filter(({ l, p }) => p !== l && p !== undefined);
      const [firstChanged] = changed;
      if (firstChanged) {
        const resized = changed.some(
          ({ l, p }) => p && "props" in l && "props" in p && dimsDiffer(p.props, l.props),
        );
        if (resized) return { kind: "resize", count: changed.length, name: changed.length === 1 ? labelOf(firstChanged.l) : undefined };
        const moved = changed.some(({ l, p }) => p && (p.x !== l.x || p.y !== l.y));
        if (moved) return { kind: "move", count: changed.length, name: changed.length === 1 ? labelOf(firstChanged.l) : undefined };
        return { kind: "edit", count: changed.length, name: changed.length === 1 ? labelOf(firstChanged.l) : undefined };
      }

      // Same leaves, same refs: a z-order change (bring-to-front etc.) only
      // permutes the render sequence. Same id-set and length here, so an
      // index-wise id mismatch means the order changed.
      const reordered = nextLeaves.some((l, i) => prevLeaves[i]?.id !== l.id);
      if (reordered) return { kind: "reorder" };
    }
  }

  if (labelChanged || profileChanged) return { kind: "label" };
  if (pagesChanged && prev.pages.length !== next.pages.length) return { kind: "page" };
  return { kind: "mixed" };
}

export interface HistoryTimeline {
  /** Snapshots oldest-first, including the implicit current (live) state. */
  timeline: HistorySnapshot[];
  /** Index of the current state within `timeline`. */
  currentIndex: number;
}

/** Project zundo's split stacks into one ordered timeline. `pastStates` is
 *  oldest-first, `futureStates` is newest-first (nearest redo last), so it is
 *  reversed onto a COPY: zundo reuses its arrays, and an in-place reverse would
 *  corrupt redo. The current state lives in neither stack, so it is spliced in
 *  at `pastStates.length`. */
export function buildHistoryTimeline(
  pastStates: HistorySnapshot[],
  current: HistorySnapshot,
  futureStates: HistorySnapshot[],
): HistoryTimeline {
  return {
    timeline: [...pastStates, current, ...[...futureStates].reverse()],
    currentIndex: pastStates.length,
  };
}

/** Steps to feed undo()/redo() to move the timeline cursor to `targetIndex`.
 *  Negative magnitude = undo that many; positive = redo; 0 = no-op. */
export function historyJumpSteps(targetIndex: number, currentIndex: number): number {
  return targetIndex - currentIndex;
}
