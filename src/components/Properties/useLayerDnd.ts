import { useEffect, useMemo, useRef, useState } from 'react';
import { PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { isGroup, findObjectById, findAncestors } from '../../types/Group';
import type { GroupObject } from '../../types/Group';
import type { LabelObject } from '../../registry';

/** Sentinel container id for the top-level objects list. Group containers
 *  use the group's own id, so the root needs a value that can't collide. */
export const ROOT_CONTAINER = '__root__';

/** Horizontal pixels per nesting level — matches the row's own paddingLeft
 *  step so the insertion line lines up visually with the target row's
 *  content column. Changing this means changing the row indent too. */
export const INDENT_STEP = 16;

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

/**
 * Resolve the cursor position + over-row into the actual drop target:
 * which container to write into, which row the insertion sits above (for
 * the visual line), and at which visual depth the line sits. Pure
 * function so the same logic powers both the live preview and the
 * on-release write.
 */
function resolveDropTarget(
  objects: LabelObject[],
  overRow: FlatRow,
  dragCursorX: number | null,
): { targetParent: string | null; overObj: LabelObject; effectiveDepth: number } {
  const cursorDepth = dragCursorX !== null
    ? Math.max(0, Math.floor((dragCursorX - INDENT_DEAD_ZONE) / INDENT_STEP))
    : overRow.depth;
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

/** A group becomes a "drop into" target when it has no expanded children
 *  to drop between — either collapsed, or expanded but empty. Used by
 *  both the live preview and the on-release commit so the two stay in
 *  lockstep; without this helper a change in one would silently drift. */
function shouldDropInto(group: GroupObject, expandedIds: Set<string>): boolean {
  return !expandedIds.has(group.id) || group.children.length === 0;
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    if (!dragActive) return;
    const onMove = (e: PointerEvent) => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (rect) setDragCursorX(e.clientX - rect.left);
    };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, [dragActive]);

  const clearDragState = () => {
    setOverId(null);
    setDragCursorX(null);
    setDragActive(false);
  };

  const onDragStart = () => setDragActive(true);
  const onDragOver = ({ over }: DragOverEvent) =>
    setOverId((over?.id as string) ?? null);
  const onDragCancel = () => clearDragState();

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    clearDragState();
    if (!over) return;
    const activeId = active.id as string;
    const overRow = rowsById.get(over.id as string);
    if (!overRow) return;

    if (isGroup(overRow.obj) && shouldDropInto(overRow.obj, expandedIds)) {
      reparentObject(activeId, {
        parentId: overRow.obj.id,
        index: overRow.obj.children.length,
      });
      return;
    }

    const { targetParent, overObj } = resolveDropTarget(objects, overRow, dragCursorX);
    // Pure no-op (cursor stayed on its own row, no climb) → exit. If
    // indent climbing produced an ancestor as the effective over, the
    // drop still proceeds even when active === over at the row level.
    if (overObj.id === activeId) return;

    const containerChildren = targetParent === null
      ? objects
      : (() => {
          const g = findObjectById(objects, targetParent);
          return g && isGroup(g) ? g.children : null;
        })();
    if (!containerChildren) return;
    const overDataIndex = containerChildren.findIndex((c) => c.id === overObj.id);
    if (overDataIndex === -1) return;
    // Drops land in the gap ABOVE overObj in display order (= directly
    // after overObj in data order). Same-container moves shift the
    // effective index down by one when active was previously above
    // over in data.
    const activeRow = rowsById.get(activeId);
    const activeContainer = activeRow?.containerId ?? null;
    const targetContainerId = targetParent ?? ROOT_CONTAINER;
    const sameContainer = activeContainer === targetContainerId;
    let insertionIndex: number;
    if (sameContainer) {
      const activeDataIndex = containerChildren.findIndex((c) => c.id === activeId);
      insertionIndex =
        activeDataIndex < overDataIndex ? overDataIndex : overDataIndex + 1;
    } else {
      insertionIndex = overDataIndex + 1;
    }
    reparentObject(activeId, { parentId: targetParent, index: insertionIndex });
  };

  // Derive preview from the same resolution path used by the commit
  // logic above, so the rendered line / outline is guaranteed to match
  // where a release would land.
  const preview = useMemo<DropPreview>(() => {
    const overRow = overId ? rowsById.get(overId) ?? null : null;
    if (!overRow) {
      return { dropIntoTargetId: null, insertionLineRowId: null, insertionLineDepth: null };
    }
    if (isGroup(overRow.obj) && shouldDropInto(overRow.obj, expandedIds)) {
      return {
        dropIntoTargetId: overRow.obj.id,
        insertionLineRowId: null,
        insertionLineDepth: null,
      };
    }
    const slot = resolveDropTarget(objects, overRow, dragCursorX);
    return {
      dropIntoTargetId: null,
      insertionLineRowId: slot.overObj.id,
      insertionLineDepth: slot.effectiveDepth,
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
