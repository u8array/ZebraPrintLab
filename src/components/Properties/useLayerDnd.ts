import { useEffect, useMemo, useRef, useState } from 'react';
import { PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { isGroup, findObjectById, findAncestors, isSelfOrDescendant } from '../../types/Group';
import type { GroupObject, LabelObject } from '../../types/Group';
import { INDENT_STEP } from './layerLayout';

/** Sentinel id for the top-level container. */
const ROOT_CONTAINER = '__root__';

/** Figma-style "you mean it" threshold. */
const INDENT_DEAD_ZONE = 6;

/** One connector-guide column, outermost-first. `tee` (├) / `last` (└) is the
 *  row's own elbow; `line` (│) / `empty` are ancestor pass-throughs. */
export type GuideKind = 'line' | 'tee' | 'last' | 'empty';

export interface FlatRow {
  obj: LabelObject;
  depth: number;
  containerId: string;
  /** One per ancestor level (length === depth); root rows have none. */
  guides: GuideKind[];
}

/** Reversed at each level: top-most (last in array) appears first, so a layer's
 *  z-order top sits at the panel top. `ancLast[d]` = the path ancestor at level
 *  `d` is the last (bottom-most) of its siblings in this display order, which
 *  decides whether its column keeps drawing a vertical line past this row. */
export function buildFlatRows(objects: LabelObject[], expanded: Set<string>): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (nodes: LabelObject[], depth: number, containerId: string, ancLast: boolean[]) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const obj = nodes[i];
      if (!obj) continue;
      const isLast = i === 0; // bottom-most sibling in the reversed display order
      const guides: GuideKind[] = [];
      for (let d = 0; d < depth; d++) {
        guides.push(d < depth - 1 ? (ancLast[d] ? 'empty' : 'line') : isLast ? 'last' : 'tee');
      }
      out.push({ obj, depth, containerId, guides });
      if (isGroup(obj) && expanded.has(obj.id)) {
        walk(obj.children, depth + 1, obj.id, [...ancLast, isLast]);
      }
    }
  };
  walk(objects, 0, ROOT_CONTAINER, []);
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

/** A row can receive a "drop into" when it's a group not showing its children
 *  inline: an empty group (the only way to nest into it) or a collapsed one.
 *  Expanded groups nest via their visible child rows instead. */
function intoCapable(overRow: FlatRow, expandedIds: Set<string>): boolean {
  if (!isGroup(overRow.obj)) return false;
  if (overRow.obj.children.length === 0) return true;
  return !expandedIds.has(overRow.obj.id);
}

export type DropBand = 'above' | 'into' | 'below';

/** Vertical drop zone within the over-row. Into-capable group rows split three
 *  ways (top sibling / middle into / bottom sibling) so nesting is a hover of
 *  the row's middle, not a horizontal aim; other rows keep the top/bottom half
 *  for sibling above/below. */
export function dropBand(
  cursorY: number | null,
  rect: { top: number; height: number } | null,
  intoMiddle: boolean,
): DropBand {
  if (cursorY == null || !rect || rect.height === 0) return 'above';
  const rel = (cursorY - rect.top) / rect.height;
  if (intoMiddle) {
    if (rel < 0.3) return 'above';
    if (rel > 0.7) return 'below';
    return 'into';
  }
  return rel < 0.5 ? 'above' : 'below';
}

type DropMode =
  | { kind: 'into'; group: GroupObject }
  | {
      kind: 'sibling';
      targetParent: string | null;
      overObj: LabelObject;
      effectiveDepth: number;
    };

interface DropContext {
  objects: LabelObject[];
  rows: FlatRow[];
  overRow: FlatRow;
  cursorX: number | null;
  cursorY: number | null;
  rect: { top: number; height: number } | null;
  expandedIds: Set<string>;
}

/** True when the cursor is dragged below the last display row. That blank tail
 *  under the tree means "root level, back-most", like a file explorer: it makes
 *  the outermost slot reachable without the indent-climb gesture. */
export function isPastListEnd(
  rows: FlatRow[],
  overRow: FlatRow,
  cursorY: number | null,
  rect: { top: number; height: number } | null,
): boolean {
  const last = rows[rows.length - 1];
  return (
    !!last && overRow.obj.id === last.obj.id &&
    cursorY != null && !!rect && cursorY > rect.top + rect.height
  );
}

function resolveDropMode(ctx: DropContext): DropMode & { above: boolean } {
  const { objects, rows, overRow, cursorX, cursorY, rect, expandedIds } = ctx;
  const first = objects[0];
  // Past the bottom: land at root, back-most, no matter which nested row is
  // nearest, so a trailing group can't capture the drop.
  if (first && isPastListEnd(rows, overRow, cursorY, rect)) {
    return { kind: 'sibling', targetParent: null, overObj: first, effectiveDepth: 0, above: false };
  }
  const intoMiddle = intoCapable(overRow, expandedIds);
  const band = dropBand(cursorY, rect, intoMiddle);
  if (band === 'into' && isGroup(overRow.obj)) {
    return { kind: 'into', group: overRow.obj, above: true };
  }
  const slot = resolveDropTarget(objects, overRow, cursorX);
  return { kind: 'sibling', ...slot, above: band === 'above' };
}

/** Display row + edge to draw the sibling gap on for a logical drop after
 *  (`above`) or before (`!above`) `overObjId`. "Before" in data is below in the
 *  z-reversed display, which sits at the BOTTOM of the over-row's shown subtree
 *  (an expanded group renders its children below its own row), so the gap
 *  anchors at the last display descendant, not the group header. */
export function gapAnchor(
  rows: FlatRow[],
  overObjId: string,
  above: boolean,
): { rowId: string; above: boolean } {
  if (above) return { rowId: overObjId, above: true };
  const i = rows.findIndex((r) => r.obj.id === overObjId);
  const base = i === -1 ? undefined : rows[i];
  if (!base) return { rowId: overObjId, above: false };
  let j = i;
  while ((rows[j + 1]?.depth ?? -1) > base.depth) j++;
  return { rowId: (rows[j] ?? base).obj.id, above: false };
}

/** Data index to insert a dragged block relative to `overId`. The panel is
 *  z-order reversed (above-in-display === after-in-data), so `above` adds 1 to
 *  land after the over-row, while `!above` lands before it (below in display),
 *  which is the only way to reach the back-most slot. Indexed among the
 *  survivors (container minus the moved block, detached before re-insert) so the
 *  block can't overshoot. -1 when `overId` is a mover. */
export function siblingDropIndex(
  containerChildren: LabelObject[],
  overId: string,
  moverIds: readonly string[],
  above: boolean,
): number {
  const movers = new Set(moverIds);
  const survivors = containerChildren.filter((c) => !movers.has(c.id));
  const i = survivors.findIndex((c) => c.id === overId);
  return i === -1 ? -1 : i + (above ? 1 : 0);
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
  /** Render the sibling line above (true) or below (false) the over-row. */
  insertionLineAbove: boolean;
}

interface UseLayerDndArgs {
  objects: LabelObject[];
  rows: FlatRow[];
  rowsById: Map<string, FlatRow>;
  expandedIds: Set<string>;
  reparentObjects: (ids: readonly string[], target: { parentId: string | null; index: number }) => void;
  /** The block to move when `activeId` is dragged: the selection roots when it
   *  is selected, else just `[activeId]`. Owned by the panel (it has selection). */
  getDragIds: (activeId: string) => string[];
}

interface UseLayerDndResult {
  sensors: ReturnType<typeof useSensors>;
  collisionDetection: typeof closestCenter;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onDragStart: (e: DragStartEvent) => void;
  onDragOver: (e: DragOverEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onDragCancel: () => void;
  preview: DropPreview;
  /** Id of the row currently being dragged, for the cursor pill overlay. */
  activeId: string | null;
}

export function useLayerDnd({
  objects,
  rows,
  rowsById,
  expandedIds,
  reparentObjects,
  getDragIds,
}: UseLayerDndArgs): UseLayerDndResult {
  const [overId, setOverId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // dnd-kit's activatorEvent isn't always usable; track via document pointermove.
  // X (panel-relative) drives the indent depth; Y (viewport) the above/below half.
  const [dragCursorX, setDragCursorX] = useState<number | null>(null);
  const [dragCursorY, setDragCursorY] = useState<number | null>(null);
  // The over-row's measured rect, so the preview can pick the above/below half.
  const [overRect, setOverRect] = useState<{ top: number; height: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // Cached at drag start to avoid 60Hz getBoundingClientRect layout flushes.
  const panelRectRef = useRef<{ left: number } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    if (!dragActive) return;
    // Coalesce raw pointermove (up to ~1000Hz) to one state update per frame;
    // the preview only changes at frame granularity anyway.
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = panelRectRef.current;
        if (rect) setDragCursorX(e.clientX - rect.left);
        setDragCursorY(e.clientY);
      });
    };
    document.addEventListener('pointermove', onMove);
    return () => {
      document.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, [dragActive]);

  const clearDragState = () => {
    setOverId(null);
    setActiveId(null);
    setDragCursorX(null);
    setDragCursorY(null);
    setOverRect(null);
    setDragActive(false);
    panelRectRef.current = null;
  };

  const onDragStart = (e: DragStartEvent) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) panelRectRef.current = { left: rect.left };
    setActiveId(e.active.id as string);
    setDragActive(true);
  };
  const onDragOver = ({ over }: DragOverEvent) => {
    setOverId((over?.id as string) ?? null);
    setOverRect(over ? { top: over.rect.top, height: over.rect.height } : null);
  };
  const onDragCancel = () => clearDragState();

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    clearDragState();
    if (!over) return;
    const activeId = active.id as string;
    const overRow = rowsById.get(over.id as string);
    if (!overRow) return;
    // The whole selection block moves when the grabbed row is part of it.
    const ids = getDragIds(activeId);
    const mode = resolveDropMode({
      objects, rows, overRow, cursorX: dragCursorX, cursorY: dragCursorY,
      rect: { top: over.rect.top, height: over.rect.height }, expandedIds,
    });
    if (mode.kind === 'into') {
      // Can't drop the block into one of its own members.
      if (ids.includes(mode.group.id)) return;
      reparentObjects(ids, { parentId: mode.group.id, index: mode.group.children.length });
      return;
    }
    // No-op self-drop; indent-climb to ancestor still proceeds.
    const { targetParent, overObj } = mode;
    if (ids.includes(overObj.id)) return;
    const containerChildren = containerChildrenOf(objects, targetParent);
    if (!containerChildren) return;
    const index = siblingDropIndex(containerChildren, overObj.id, ids, mode.above);
    if (index === -1) return;
    reparentObjects(ids, { parentId: targetParent, index });
  };

  // Same resolveDropMode + above/below half as commit so preview matches landing.
  const preview = useMemo<DropPreview>(() => {
    const blank = { dropIntoTargetId: null, insertionLineRowId: null, insertionLineDepth: null, insertionLineAbove: true };
    const overRow = overId ? rowsById.get(overId) ?? null : null;
    if (!overRow) return blank;
    // Mirror onDragEnd's no-op guards so the preview never advertises a landing
    // the commit refuses: over is a mover, or the drop would cycle into a moved
    // subtree. Without this, hovering a block member shows a line that does nothing.
    const ids = activeId ? getDragIds(activeId) : [];
    const isMover = (id: string) => ids.includes(id);
    const cyclesInto = (parentId: string | null) =>
      parentId !== null && ids.some((m) => isSelfOrDescendant(objects, m, parentId));
    const mode = resolveDropMode({
      objects, rows, overRow, cursorX: dragCursorX, cursorY: dragCursorY, rect: overRect, expandedIds,
    });
    if (mode.kind === 'into') {
      if (isMover(mode.group.id) || cyclesInto(mode.group.id)) return blank;
      return { dropIntoTargetId: mode.group.id, insertionLineRowId: null, insertionLineDepth: null, insertionLineAbove: true };
    }
    if (isMover(mode.overObj.id) || cyclesInto(mode.targetParent)) return blank;
    const anchor = gapAnchor(rows, mode.overObj.id, mode.above);
    return {
      dropIntoTargetId: null,
      insertionLineRowId: anchor.rowId,
      insertionLineDepth: mode.effectiveDepth,
      insertionLineAbove: anchor.above,
    };
  }, [objects, rows, rowsById, expandedIds, overId, dragCursorX, dragCursorY, overRect, activeId, getDragIds]);

  return {
    sensors,
    collisionDetection: closestCenter,
    panelRef,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
    preview,
    activeId,
  };
}
