import { useEffect, useMemo, useRef, useState } from 'react';
import { PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { isGroup, findObjectById, findAncestors } from '../../types/Group';
import type { GroupObject, LabelObject } from '../../types/Group';
import { INDENT_STEP } from './layerLayout';

/** Sentinel id for the top-level container. */
const ROOT_CONTAINER = '__root__';

/** Figma-style "you mean it" threshold. */
const INDENT_DEAD_ZONE = 6;

export interface FlatRow {
  obj: LabelObject;
  depth: number;
  containerId: string;
}

/** Reversed at each level: top-most (last in array) appears first. */
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

/** Climb N levels; overObj is the group whose row the insertion sits above. */
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

function cursorDepthFor(dragCursorX: number | null, fallback: number): number {
  return dragCursorX !== null
    ? Math.max(0, Math.floor((dragCursorX - INDENT_DEAD_ZONE) / INDENT_STEP))
    : fallback;
}

/** Pure: shared by live preview and on-release commit. */
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

/** Empty group always "into"; expanded never; collapsed picks by cursor depth. */
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

type DropMode =
  | { kind: 'into'; group: GroupObject }
  | {
      kind: 'sibling';
      targetParent: string | null;
      overObj: LabelObject;
      effectiveDepth: number;
    };

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

/** Null when id doesn't name a group (defensive). */
function containerChildrenOf(
  objects: LabelObject[],
  parentId: string | null,
): LabelObject[] | null {
  if (parentId === null) return objects;
  const parent = findObjectById(objects, parentId);
  return parent && isGroup(parent) ? parent.children : null;
}

interface DropPreview {
  dropIntoTargetId: string | null;
  insertionLineRowId: string | null;
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

export function useLayerDnd({
  objects,
  rowsById,
  expandedIds,
  reparentObject,
}: UseLayerDndArgs): UseLayerDndResult {
  const [overId, setOverId] = useState<string | null>(null);
  // dnd-kit's activatorEvent isn't always usable; track via document pointermove.
  const [dragCursorX, setDragCursorX] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // Cached at drag start to avoid 60Hz getBoundingClientRect layout flushes.
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
    // No-op self-drop; indent-climb to ancestor still proceeds.
    const { targetParent, overObj } = mode;
    if (overObj.id === activeId) return;
    const containerChildren = containerChildrenOf(objects, targetParent);
    if (!containerChildren) return;
    const overDataIndex = containerChildren.findIndex((c) => c.id === overObj.id);
    if (overDataIndex === -1) return;
    // active replaces over's data slot; over shifts up one (reversed view: same row, over up).
    reparentObject(activeId, { parentId: targetParent, index: overDataIndex });
  };

  // Same resolveDropMode as commit so preview matches landing.
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
