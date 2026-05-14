import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
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
import { isGroup, walkObjects, findObjectById } from '../../types/Group';
import { useT } from '../../lib/useT';
import { buildBulkToggleUpdates, type ToggleField } from '../../lib/bulkToggle';
import { DragHandleIcon } from '../ui/DragHandleIcon';

/** Sentinel container id for the top-level objects list. Group containers
 *  use the group's own id, so the root needs a value that can't collide. */
const ROOT_CONTAINER = '__root__';

/** Droppable id for the implicit drop zone rendered after the last row.
 *  Lets the user pull a child out of a group by dragging downward past
 *  the bottom of the panel — without this, the bottom-most element has
 *  no row below it to use as a drop target. */
const BOTTOM_DROP_ZONE = '__bottom_drop__';

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
  // Indent the insertion line so it visually aligns with the indented
  // row, signalling that the drop will land at that nesting level.
  const linePadLeft = depth > 0 ? depth * 16 + 16 : 8;

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
      style={{ touchAction: 'none', paddingLeft: depth > 0 ? depth * 16 + 8 : undefined }}
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

function BottomDropZone({ active }: { active: boolean }) {
  const { setNodeRef } = useDroppable({ id: BOTTOM_DROP_ZONE });
  // 12px is enough to be a comfortable hit target without adding visible
  // panel padding. Highlights softly while a drag is hovering it so the
  // user sees the extract-to-top-level affordance.
  return (
    <div
      ref={setNodeRef}
      className={`h-3 mx-2 mt-0.5 rounded transition-colors ${
        active ? 'bg-accent/30 outline outline-1 outline-accent/60' : 'bg-transparent'
      }`}
    />
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

  if (objects.length === 0) {
    return (
      <div className="p-4 text-center text-muted text-xs mt-6">
        {t.layers.empty}
      </div>
    );
  }

  const allRowIds = rows.map((r) => r.obj.id);

  const handleDragOver = ({ over }: DragOverEvent) =>
    setOverId((over?.id as string) ?? null);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setOverId(null);
    if (!over || active.id === over.id) return;
    const activeId = active.id as string;

    // Bottom drop zone: move the active to the very bottom of the
    // top-level list (data index 0 in display-reversed terms). Lets a
    // user extract a child by dragging downward past the last row.
    if (over.id === BOTTOM_DROP_ZONE) {
      reparentObject(activeId, { parentId: null, index: 0 });
      return;
    }

    const overRow = rowsById.get(over.id as string);
    if (!overRow) return;

    // "Drop into group" target: a group that has no expanded children
    // to drop between — either collapsed, or expanded but empty.
    // Otherwise the user can drop on any child row inside, which lands
    // the item inside the group via the sibling code path below.
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

    // Sibling case: active lands in the gap ABOVE over in display order,
    // which matches the rendered insertion line. The panel reverses
    // each container (topmost row = last in array), so the gap above
    // over in display sits right AFTER over in data order. After
    // detaching active from a same-container source, over's effective
    // data index drops by one when active was previously above over in
    // data; the conditional below adjusts for that so the final
    // landing slot stays the visual gap the user saw.
    const targetParent = overRow.containerId === ROOT_CONTAINER
      ? null
      : overRow.containerId;
    const containerChildren = targetParent === null
      ? objects
      : (() => {
          const g = findObjectById(objects, targetParent);
          return g && isGroup(g) ? g.children : null;
        })();
    if (!containerChildren) return;
    const overDataIndex = containerChildren.findIndex(
      (c) => c.id === overRow.obj.id,
    );
    if (overDataIndex === -1) return;
    const activeRow = rowsById.get(activeId);
    const sameContainer =
      activeRow?.containerId === overRow.containerId;
    let insertionIndex: number;
    if (sameContainer) {
      const activeDataIndex = containerChildren.findIndex(
        (c) => c.id === activeId,
      );
      insertionIndex =
        activeDataIndex < overDataIndex ? overDataIndex : overDataIndex + 1;
    } else {
      insertionIndex = overDataIndex + 1;
    }
    reparentObject(activeId, { parentId: targetParent, index: insertionIndex });
  };

  const handleDragCancel = () => setOverId(null);

  // While dragging, `overId` is the row the cursor is currently on top
  // of. Translate that into one of two visual modes:
  //
  //   dropIntoTargetId – the row's body gets an outline because the
  //     drop will dive INTO it (collapsed group case).
  //   insertionLineRowId – the row gets a thin accent line above it
  //     because the drop will land as a sibling immediately before it
  //     (in display order). Suppressed when the active is already at
  //     that exact slot, so the indicator only shows when releasing
  //     would actually change the model.
  const overRow = overId ? rowsById.get(overId) ?? null : null;
  const dropIntoTargetId =
    overRow &&
    isGroup(overRow.obj) &&
    (!expandedIds.has(overRow.obj.id) || overRow.obj.children.length === 0)
      ? overRow.obj.id
      : null;
  const insertionLineRowId =
    overRow && !dropIntoTargetId ? overRow.obj.id : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={allRowIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col">
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
          <BottomDropZone active={overId === BOTTOM_DROP_ZONE} />
        </div>
      </SortableContext>
    </DndContext>
  );
}
