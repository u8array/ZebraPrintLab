import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  EyeIcon,
  EyeSlashIcon,
  LockClosedIcon,
  LockOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  LinkSlashIcon,
} from '@heroicons/react/16/solid';
import { useLabelStore, useCurrentObjects } from '../../store/labelStore';
import { ObjectRegistry } from '../../registry';
import type { LabelObject } from '../../registry';
import { isGroup, walkObjects, findObjectById, findAncestors } from '../../types/Group';
import { useT } from '../../lib/useT';
import { buildBulkToggleUpdates, type ToggleField } from '../../lib/bulkToggle';
import { DragHandleIcon } from '../ui/DragHandleIcon';

/** Sentinel container id for the top-level objects list. Group containers
 *  use the group's own id, so the root needs a value that can't collide. */
const ROOT_CONTAINER = '__root__';

/** Horizontal pixels per nesting level — matches the row's own paddingLeft
 *  step so the insertion line lines up visually with the target row's
 *  content column. Changing this means changing the row indent too. */
const INDENT_STEP = 16;

/** Pixel bias subtracted from the cursor X before quantising to depth so a
 *  user has to drag a little before the target depth changes. Tuned to feel
 *  like Figma's "you mean it" threshold. */
const INDENT_DEAD_ZONE = 6;

interface FlatRow {
  obj: LabelObject;
  depth: number;
  containerId: string;
}

/** Walk the tree depth-first, reversed at each level so the topmost item
 *  (last in the array = front-most in render order) appears first in the
 *  panel. Each row carries its container id so drag-and-drop can decide
 *  whether a move is a sibling reorder or a cross-container reparent. */
function buildFlatRows(objects: LabelObject[], expanded: Set<string>): FlatRow[] {
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

interface RowProps {
  obj: LabelObject;
  depth: number;
  containerId: string;
  isSelected: boolean;
  isExpanded: boolean;
  /** Highlight the row body — used for "drop into this group". */
  isDropTarget: boolean;
  /** Show an accent line above this row — used for sibling drops so the
   *  user sees the exact landing slot before releasing. */
  showInsertionLine: boolean;
  /** Visual depth at which to render the insertion line. Diverges from
   *  the row's own depth while the user drags horizontally to climb out
   *  of a deeply nested container. */
  insertionLineDepth: number | null;
  onSelect: () => void;
  onToggle: () => void;
  onToggleLock: () => void;
  onToggleVisible: () => void;
  onToggleExpand: () => void;
  onUngroup: () => void;
  tLock: string;
  tUnlock: string;
  tShow: string;
  tHide: string;
  tGroup: string;
  tExpand: string;
  tCollapse: string;
  tUngroupLabel: string;
}

function LayerRow({
  obj,
  depth,
  containerId,
  isSelected,
  isExpanded,
  isDropTarget,
  showInsertionLine,
  insertionLineDepth,
  onSelect,
  onToggle,
  onToggleLock,
  onToggleVisible,
  onToggleExpand,
  onUngroup,
  tLock,
  tUnlock,
  tShow,
  tHide,
  tGroup,
  tExpand,
  tCollapse,
  tUngroupLabel,
}: RowProps) {
  const def = ObjectRegistry[obj.type];
  const groupRow = isGroup(obj);
  const isLocked = !!obj.locked;
  const isHidden = obj.visible === false;
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: obj.id,
    data: { containerId },
    disabled: isLocked,
  });
  const stopRowClick = (e: React.MouseEvent) => e.stopPropagation();
  // The line indent follows the *target* depth, not the row's own depth,
  // so as the user drags left the line slides left in real time.
  const lineDepth = insertionLineDepth ?? depth;
  const linePadLeft = lineDepth > 0 ? lineDepth * INDENT_STEP + 16 : 8;

  return (
    <>
      <div
        className={`h-0.5 mr-2 rounded transition-colors ${
          showInsertionLine ? 'bg-accent' : 'bg-transparent'
        }`}
        style={{ marginLeft: linePadLeft }}
      />
    <div
      ref={setNodeRef}
      style={{ touchAction: 'none', paddingLeft: depth > 0 ? depth * INDENT_STEP + 8 : undefined }}
      {...attributes}
      {...(isLocked ? {} : listeners)}
      onClick={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) onToggle();
        else onSelect();
      }}
      className={`
        flex items-center gap-2 px-2 py-1.5
        ${isLocked ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
        border-b border-border group transition-colors hover:bg-surface-2
        ${isSelected ? 'bg-surface-2 border-l-2 border-l-accent' : 'border-l-2 border-l-transparent'}
        ${isDragging ? 'opacity-40' : ''}
        ${isHidden ? 'opacity-50' : ''}
        ${isDropTarget ? 'bg-accent/15 outline outline-1 outline-accent/60' : ''}
      `}
    >
      <DragHandleIcon
        className={`w-2 h-3.5 shrink-0 text-muted transition-opacity ${isLocked ? 'opacity-0' : 'opacity-0 group-hover:opacity-60'}`}
      />
      {groupRow ? (
        <button
          type="button"
          onPointerDown={stopRowClick}
          onClick={(e) => { stopRowClick(e); onToggleExpand(); }}
          title={isExpanded ? tCollapse : tExpand}
          aria-label={isExpanded ? tCollapse : tExpand}
          aria-expanded={isExpanded}
          className="w-4 h-4 flex items-center justify-center rounded text-muted hover:text-text hover:bg-surface shrink-0"
        >
          {isExpanded
            ? <ChevronDownIcon className="w-3 h-3" />
            : <ChevronRightIcon className="w-3 h-3" />}
        </button>
      ) : (
        <span className="w-4 h-4 shrink-0" />
      )}
      <span className="font-mono text-xs text-accent shrink-0 w-4 text-center">
        {groupRow ? '⊞' : def?.icon}
      </span>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-xs text-text truncate">
          {groupRow ? tGroup : (def?.label ?? obj.type)}
        </span>
        <span className="font-mono text-[9px] text-muted">{obj.id.slice(0, 8)}</span>
      </div>
      {groupRow && (
        <button
          type="button"
          onPointerDown={stopRowClick}
          onClick={(e) => { stopRowClick(e); onUngroup(); }}
          title={tUngroupLabel}
          aria-label={tUngroupLabel}
          className="w-5 h-5 flex items-center justify-center rounded transition-colors text-muted opacity-0 group-hover:opacity-100 hover:text-text hover:bg-surface"
        >
          <LinkSlashIcon className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        type="button"
        onPointerDown={stopRowClick}
        onClick={(e) => { stopRowClick(e); onToggleVisible(); }}
        title={isHidden ? tShow : tHide}
        aria-label={isHidden ? tShow : tHide}
        className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${isHidden ? 'text-accent' : 'text-muted opacity-0 group-hover:opacity-100'} hover:text-text hover:bg-surface`}
      >
        {isHidden ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onPointerDown={stopRowClick}
        onClick={(e) => { stopRowClick(e); onToggleLock(); }}
        title={isLocked ? tUnlock : tLock}
        aria-label={isLocked ? tUnlock : tLock}
        className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${isLocked ? 'text-accent' : 'text-muted opacity-0 group-hover:opacity-100'} hover:text-text hover:bg-surface`}
      >
        {isLocked ? <LockClosedIcon className="w-3.5 h-3.5" /> : <LockOpenIcon className="w-3.5 h-3.5" />}
      </button>
    </div>
    </>
  );
}

export function LayersPanel() {
  const t = useT();
  const {
    selectedIds,
    selectObject,
    toggleSelectObject,
    updateObjects,
    ungroupIds,
    reparentObject,
  } = useLabelStore();
  const objects = useCurrentObjects();
  const [overId, setOverId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Cursor X within the panel during a drag — drives indent-style depth
  // selection so dragging left climbs out of a container the same way
  // Figma / VSCode tree views handle it. Tracked via a document-level
  // pointermove listener that runs while a drag is active because
  // dnd-kit's activatorEvent / delta path is not always available
  // (e.g. activator events are sometimes synthesised without clientX).
  const [dragCursorX, setDragCursorX] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dragActive) return;
    const onMove = (e: PointerEvent) => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (rect) setDragCursorX(e.clientX - rect.left);
    };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, [dragActive]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const allNodes = useMemo(() => [...walkObjects(objects)], [objects]);
  const rows = useMemo(() => buildFlatRows(objects, expandedIds), [objects, expandedIds]);
  const rowsById = useMemo(() => {
    const m = new Map<string, FlatRow>();
    for (const r of rows) m.set(r.obj.id, r);
    return m;
  }, [rows]);

  const toggleField = (clickedId: string, field: ToggleField) => {
    const updates = buildBulkToggleUpdates(allNodes, selectedIds, clickedId, field);
    if (updates.length > 0) updateObjects(updates);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * Walk up the container chain by N levels. Returns the container at the
   * target depth and the group node that lives AT that climbed level — the
   * latter is the row whose visual position the insertion will sit above.
   */
  const climbContainer = (
    fromContainerId: string,
    levels: number,
  ): { containerId: string; overObj: LabelObject | null } => {
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
  };

  /**
   * Resolve the cursor position + over-row into the actual drop target:
   * which container to write into, which row the insertion sits above
   * (for the visual line), and at which visual depth the line sits.
   * Returns null when there's nothing actionable (no over, depth mismatch).
   */
  const resolveDropTarget = (overRow: FlatRow): {
    targetParent: string | null;
    overObj: LabelObject;
    effectiveDepth: number;
  } => {
    const cursorDepth = dragCursorX !== null
      ? Math.max(0, Math.floor((dragCursorX - INDENT_DEAD_ZONE) / INDENT_STEP))
      : overRow.depth;
    const effectiveDepth = Math.min(cursorDepth, overRow.depth);
    const levels = overRow.depth - effectiveDepth;
    if (levels === 0) {
      const parent = overRow.containerId === ROOT_CONTAINER ? null : overRow.containerId;
      return { targetParent: parent, overObj: overRow.obj, effectiveDepth };
    }
    const climbed = climbContainer(overRow.containerId, levels);
    return {
      targetParent: climbed.containerId === ROOT_CONTAINER ? null : climbed.containerId,
      overObj: climbed.overObj ?? overRow.obj,
      effectiveDepth,
    };
  };

  if (objects.length === 0) {
    return (
      <div className="p-4 text-center text-muted text-xs mt-6">
        {t.layers.empty}
      </div>
    );
  }

  const allRowIds = rows.map((r) => r.obj.id);

  const handleDragStart = () => setDragActive(true);

  const handleDragOver = ({ over }: DragOverEvent) =>
    setOverId((over?.id as string) ?? null);

  const clearDragState = () => {
    setOverId(null);
    setDragCursorX(null);
    setDragActive(false);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    clearDragState();
    if (!over || active.id === over.id) return;
    const activeId = active.id as string;
    const overRow = rowsById.get(over.id as string);
    if (!overRow) return;

    // "Drop into group" target: a group that has no expanded children
    // to drop between — either collapsed, or expanded but empty. The
    // indent-drag path is skipped here because there's no "land beside"
    // semantic on an empty container; the only meaningful drop is INTO.
    if (
      isGroup(overRow.obj) &&
      (!expandedIds.has(overRow.obj.id) || overRow.obj.children.length === 0)
    ) {
      reparentObject(activeId, {
        parentId: overRow.obj.id,
        index: overRow.obj.children.length,
      });
      return;
    }

    // Indent-aware sibling drop: the cursor's X position selects how
    // deep in the container chain the drop lands. Dragging left climbs
    // out of nested groups; the resolveDropTarget call already did the
    // ancestor walk and gave us the effective over row.
    const { targetParent, overObj } = resolveDropTarget(overRow);
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
    // over in data — without the shift the row would end up one slot
    // off from where the insertion line implied.
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

  const handleDragCancel = () => clearDragState();

  // While dragging, `overId` is the row the cursor is currently on top
  // of. resolveDropTarget translates that plus the cursor X into the
  // actual drop slot — the row whose gap-above will host the insertion
  // line, and the depth at which the line should sit.
  const overRow = overId ? rowsById.get(overId) ?? null : null;
  const dropIntoTargetId =
    overRow &&
    isGroup(overRow.obj) &&
    (!expandedIds.has(overRow.obj.id) || overRow.obj.children.length === 0)
      ? overRow.obj.id
      : null;
  const previewSlot = overRow && !dropIntoTargetId
    ? resolveDropTarget(overRow)
    : null;
  const insertionLineRowId = previewSlot?.overObj.id ?? null;
  const insertionLineDepth = previewSlot?.effectiveDepth ?? null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={allRowIds} strategy={verticalListSortingStrategy}>
        <div ref={panelRef} className="flex flex-col">
          {rows.map(({ obj, depth, containerId }) => (
            <LayerRow
              key={obj.id}
              obj={obj}
              depth={depth}
              containerId={containerId}
              isSelected={selectedIds.includes(obj.id)}
              isExpanded={expandedIds.has(obj.id)}
              isDropTarget={dropIntoTargetId === obj.id}
              showInsertionLine={insertionLineRowId === obj.id}
              insertionLineDepth={
                insertionLineRowId === obj.id ? insertionLineDepth : null
              }
              onSelect={() => selectObject(obj.id)}
              onToggle={() => toggleSelectObject(obj.id)}
              onToggleLock={() => toggleField(obj.id, 'locked')}
              onToggleVisible={() => toggleField(obj.id, 'visible')}
              onToggleExpand={() => toggleExpand(obj.id)}
              onUngroup={() => ungroupIds([obj.id])}
              tLock={t.layers.lock}
              tUnlock={t.layers.unlock}
              tShow={t.layers.show}
              tHide={t.layers.hide}
              tGroup={t.types.group}
              tExpand={t.app.expand}
              tCollapse={t.app.collapse}
              tUngroupLabel={t.layers.ungroup}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
