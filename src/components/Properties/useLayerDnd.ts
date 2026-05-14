import { useEffect, useMemo, useRef, useState } from 'react';
import { PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { isGroup, findObjectById, findAncestors } from '../../types/Group';
import type { GroupObject } from '../../types/Group';
import type { LabelObject } from '../../registry';
import { INDENT_STEP } from './layerLayout';

/** Sentinel container id for the top-level objects list. Group containers
 *  use the group's own id, so the root needs a value that can't collide. */
export const ROOT_CONTAINER = '__root__';

/** Pixel bias subtracted from the cursor X before quantising to depth so a
 *  user has to drag a little before the target depth changes. Tuned to feel
 *  like Figma's "you mean it" threshold. */
const INDENT_DEAD_ZONE = 6;

export interface FlatRow {
  obj: LabelObject;
  depth: number;
  containerId: string;
}

/** Walk the tree depth-first, reversed at each level so the topmost item
 *  (last in the array = front-most in render order) appears first in the
 *  panel. Each row carries its container id so drag-and-drop can decide
 *  whether a move is a sibling reorder or a cross-container reparent. */
export function buildFlatRows(objects: LabelObject[], expanded: Set<string>): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (nodes: LabelObject[], depth: number, containerId: string) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const obj = nodes[i];
      if (!obj) continue;
      out.push({ obj, depth, containerId });
      if (isGroup(obj) && expanded.has(obj.id)) walk(obj.children, depth + 1, obj.id);
    }
  };
  walk(objects, 0, ROOT_CONTAINER);
  return out;
}

/**
 * Walk up the container chain by N levels. Returns the container at the
 * target depth and the group node that lives AT that climbed level — the
 * latter is the row whose visual position the insertion will sit above.
 */
function climbContainer(
  objects: LabelObject[],
  fromContainerId: string,
  levels: number,
): { containerId: string; overObj: LabelObject | null } {
  if (levels <= 0) return { containerId: fromContainerId, overObj: null };
  let current = fromContainerId;
  let overObj: LabelObject | null = null;
  for (let i = 0; i < levels && current !== ROOT_CONTAINER; i++) {
    const groupNode = findObjectById(objects, current);
    if (!groupNode) break;
    overObj = groupNode;
    const ancestors = findAncestors(objects, current);
    const parent = ancestors[ancestors.length - 1];
    current = parent ? parent.id : ROOT_CONTAINER;
  }
  return { containerId: current, overObj };
}

/** Quantise a cursor X (panel-relative) into an indent depth. Used by
 *  the drop-mode resolver and `resolveDropTarget` so cursor position is
 *  read through one mapping. */
function cursorDepthFor(dragCursorX: number | null, fallback: number): number {
  return dragCursorX !== null
    ? Math.max(0, Math.floor((dragCursorX - INDENT_DEAD_ZONE) / INDENT_STEP))
    : fallback;
}

/**
 * Resolve the cursor position + over-row into the actual sibling drop
 * target: which container to write into, which row the insertion sits
 * above (for the visual line), and at which visual depth the line
 * sits. Pure function — used by both the live preview and the
 * on-release commit. Drop-into-group decisions live in
 * `resolveDropMode` above this.
 */
function resolveDropTarget(
  objects: LabelObject[],
  overRow: FlatRow,
  dragCursorX: number | null,
): { targetParent: string | null; overObj: LabelObject; effectiveDepth: number } {
  const cursorDepth = cursorDepthFor(dragCursorX, overRow.depth);
  const effectiveDepth = Math.min(cursorDepth, overRow.depth);
  const levels = overRow.depth - effectiveDepth;
  if (levels === 0) {
    const parent = overRow.containerId === ROOT_CONTAINER ? null : overRow.containerId;
    return { targetParent: parent, overObj: overRow.obj, effectiveDepth };
  }
  const climbed = climbContainer(objects, overRow.containerId, levels);
  return {
    targetParent: climbed.containerId === ROOT_CONTAINER ? null : climbed.containerId,
    overObj: climbed.overObj ?? overRow.obj,
    effectiveDepth,
  };
}

/** Decide whether a drop on a group's row should land INSIDE the group
 *  (filling its children) vs. as a sibling of the group. Empty groups
 *  always treat the drop as "into" because there's no sibling-only
 *  affordance to populate them. Collapsed non-empty groups use the
 *  cursor's indent depth: if the user has pulled the cursor deeper
 *  than the group's own row, they're aiming "inside"; otherwise the
 *  drop becomes a sibling, which is what lets the user place an item
 *  immediately above a collapsed group. Expanded groups never accept
 *  a drop-into here — the user drops on a child to land beside it. */
function shouldDropInto(
  group: GroupObject,
  groupDepth: number,
  expandedIds: Set<string>,
  cursorDepth: number,
): boolean {
  if (group.children.length === 0) return true;
  if (expandedIds.has(group.id)) return false;
  return cursorDepth > groupDepth;
}

/** Discriminated drop outcome: either we're filling a group (into) or
 *  inserting beside an existing row at some effective depth (sibling).
 *  One representation that both `onDragEnd` and the preview memo match
 *  against, so the commit and the rendered indicator can never drift. */
type DropMode =
  | { kind: 'into'; group: GroupObject }
  | {
      kind: 'sibling';
      targetParent: string | null;
      overObj: LabelObject;
      effectiveDepth: number;
    };

/** Single home for "where is the drop going" — used by the commit
 *  path and the preview derivation alike. */
function resolveDropMode(
  objects: LabelObject[],
  overRow: FlatRow,
  dragCursorX: number | null,
  expandedIds: Set<string>,
): DropMode {
  const cursorDepth = cursorDepthFor(dragCursorX, overRow.depth);
  if (
    isGroup(overRow.obj) &&
    shouldDropInto(overRow.obj, overRow.depth, expandedIds, cursorDepth)
  ) {
    return { kind: 'into', group: overRow.obj };
  }
  const slot = resolveDropTarget(objects, overRow, dragCursorX);
  return { kind: 'sibling', ...slot };
}

/** Resolve a parent id (or null for root) into the child array to
 *  splice into. Returns null when the id doesn't name a group — the
 *  layers panel shouldn't produce this, but a defensive return keeps
 *  the commit path from picking up bogus state. */
function containerChildrenOf(
  objects: LabelObject[],
  parentId: string | null,
): LabelObject[] | null {
  if (parentId === null) return objects;
  const parent = findObjectById(objects, parentId);
  return parent && isGroup(parent) ? parent.children : null;
}

interface DropPreview {
  /** Row whose body should be outlined as a "drop into" target. */
  dropIntoTargetId: string | null;
  /** Row above which the insertion line appears. */
  insertionLineRowId: string | null;
  /** Visual depth at which the insertion line should render. */
  insertionLineDepth: number | null;
}

interface UseLayerDndArgs {
  objects: LabelObject[];
  rowsById: Map<string, FlatRow>;
  expandedIds: Set<string>;
  reparentObject: (id: string, target: { parentId: string | null; index: number }) => void;
}

interface UseLayerDndResult {
  sensors: ReturnType<typeof useSensors>;
  collisionDetection: typeof closestCenter;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onDragStart: () => void;
  onDragOver: (e: DragOverEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onDragCancel: () => void;
  preview: DropPreview;
}

/**
 * Owns every piece of drag/drop state for the layers panel: cursor
 * tracking for indent-style depth selection, the over-row id, the live
 * preview (drop-into outline vs. insertion line), and the commit on
 * release. The panel component receives a ready-to-spread surface and
 * a per-frame preview object — nothing about the dnd protocol leaks
 * out of here.
 */
export function useLayerDnd({
  objects,
  rowsById,
  expandedIds,
  reparentObject,
}: UseLayerDndArgs): UseLayerDndResult {
  const [overId, setOverId] = useState<string | null>(null);
  // Cursor X within the panel during a drag — drives indent-style depth
  // selection so dragging left climbs out of a container the same way
  // Figma / VSCode tree views handle it. Tracked via a document-level
  // pointermove listener that runs while a drag is active because
  // dnd-kit's activatorEvent / delta path is not always available.
  const [dragCursorX, setDragCursorX] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // Cached panel rect captured once at drag start. Reading
  // getBoundingClientRect inside the 60Hz pointermove handler forces a
  // synchronous layout pass on every move; the cache replaces that
  // with a single read per drag at the cost of going stale on
  // mid-drag scroll/resize (acceptable — users don't typically
  // scroll while dragging a layer row).
  const panelRectRef = useRef<{ left: number } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    if (!dragActive) return;
    const onMove = (e: PointerEvent) => {
      const rect = panelRectRef.current;
      if (rect) setDragCursorX(e.clientX - rect.left);
    };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, [dragActive]);

  const clearDragState = () => {
    setOverId(null);
    setDragCursorX(null);
    setDragActive(false);
    panelRectRef.current = null;
  };

  const onDragStart = () => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) panelRectRef.current = { left: rect.left };
    setDragActive(true);
  };
  const onDragOver = ({ over }: DragOverEvent) =>
    setOverId((over?.id as string) ?? null);
  const onDragCancel = () => clearDragState();

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    clearDragState();
    if (!over) return;
    const activeId = active.id as string;
    const overRow = rowsById.get(over.id as string);
    if (!overRow) return;
    const mode = resolveDropMode(objects, overRow, dragCursorX, expandedIds);
    if (mode.kind === 'into') {
      reparentObject(activeId, {
        parentId: mode.group.id,
        index: mode.group.children.length,
      });
      return;
    }
    // Sibling drop. Pure no-op (cursor stayed on its own row, no
    // climb) → exit. If indent climbing produced an ancestor as the
    // effective over, the drop still proceeds even when active ===
    // over at the row level.
    const { targetParent, overObj } = mode;
    if (overObj.id === activeId) return;
    const containerChildren = containerChildrenOf(objects, targetParent);
    if (!containerChildren) return;
    const overDataIndex = containerChildren.findIndex((c) => c.id === overObj.id);
    if (overDataIndex === -1) return;
    // Insertion index = over's data index, always. Since reparentObject
    // detaches the active before inserting, this means active replaces
    // over's slot in data order and over (and everything above it in
    // data) shifts up by one. In display (reversed) terms, active lands
    // at the visual position over was at and over moves one row up.
    reparentObject(activeId, { parentId: targetParent, index: overDataIndex });
  };

  // Derive preview from the same resolveDropMode path used on commit,
  // so the rendered line / outline is guaranteed to match where a
  // release would land.
  const preview = useMemo<DropPreview>(() => {
    const overRow = overId ? rowsById.get(overId) ?? null : null;
    if (!overRow) {
      return { dropIntoTargetId: null, insertionLineRowId: null, insertionLineDepth: null };
    }
    const mode = resolveDropMode(objects, overRow, dragCursorX, expandedIds);
    if (mode.kind === 'into') {
      return {
        dropIntoTargetId: mode.group.id,
        insertionLineRowId: null,
        insertionLineDepth: null,
      };
    }
    return {
      dropIntoTargetId: null,
      insertionLineRowId: mode.overObj.id,
      insertionLineDepth: mode.effectiveDepth,
    };
    // rowsById is the projection of rows, so depending on it covers
    // expand/collapse reshuffles without needing rows as a separate dep.
  }, [objects, rowsById, expandedIds, overId, dragCursorX]);

  return {
    sensors,
    collisionDetection: closestCenter,
    panelRef,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
    preview,
  };
}
