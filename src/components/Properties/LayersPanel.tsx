import { useMemo, useState } from 'react';
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
import { isGroup, walkObjects } from '../../types/Group';
import { useT } from '../../lib/useT';
import { buildBulkToggleUpdates, type ToggleField } from '../../lib/bulkToggle';
import { DragHandleIcon } from '../ui/DragHandleIcon';

/** Layers panel renders a tree but the data model carries a flat top-level
 *  array; this is the projection consumers iterate over. `depth` controls
 *  the row's indent and whether it participates in drag-reorder. */
interface FlatRow {
  obj: LabelObject;
  depth: number;
}

/** Walk the tree depth-first, reversed at each level so the topmost item
 *  (last in the array = front-most in render order) appears first in the
 *  panel. A group is only expanded if its id is in `expanded`; collapsed
 *  groups still render as one row but their children are skipped. */
function buildFlatRows(objects: LabelObject[], expanded: Set<string>): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (nodes: LabelObject[], depth: number) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const obj = nodes[i];
      if (!obj) continue;
      out.push({ obj, depth });
      if (isGroup(obj) && expanded.has(obj.id)) walk(obj.children, depth + 1);
    }
  };
  walk(objects, 0);
  return out;
}

interface CommonRowProps {
  obj: LabelObject;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
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

interface RowBodyProps extends CommonRowProps {
  /** Slot for the row's leading affordance (drag handle for sortable rows,
   *  empty placeholder for nested rows that don't participate in drag). */
  leading: React.ReactNode;
  /** Forwarded to the row's root element. */
  rootRef?: React.Ref<HTMLDivElement>;
  /** Spread on root: @dnd-kit's `attributes`/`listeners` for sortable rows. */
  rootAttrs?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
}

function RowBody({
  obj,
  depth,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
  onToggleLock,
  onToggleVisible,
  onToggleExpand,
  onUngroup,
  leading,
  rootRef,
  rootAttrs,
  isDragging,
  tLock,
  tUnlock,
  tShow,
  tHide,
  tGroup,
  tExpand,
  tCollapse,
  tUngroupLabel,
}: RowBodyProps) {
  const def = ObjectRegistry[obj.type];
  const groupRow = isGroup(obj);
  const isLocked = !!obj.locked;
  const isHidden = obj.visible === false;
  const stopRowClick = (e: React.MouseEvent) => e.stopPropagation();
  // Nested rows share the row click but don't participate in drag, so the
  // cursor stays the default click affordance.
  const cursor = depth > 0
    ? 'cursor-pointer'
    : isLocked
      ? 'cursor-pointer'
      : 'cursor-grab active:cursor-grabbing';

  return (
    <div
      ref={rootRef}
      style={{ touchAction: 'none', paddingLeft: depth > 0 ? depth * 16 + 8 : undefined }}
      {...rootAttrs}
      onClick={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) onToggle();
        else onSelect();
      }}
      className={`
        flex items-center gap-2 px-2 py-1.5
        ${cursor}
        border-b border-border group transition-colors hover:bg-surface-2
        ${isSelected ? 'bg-surface-2 border-l-2 border-l-accent' : 'border-l-2 border-l-transparent'}
        ${isDragging ? 'opacity-40' : ''}
        ${isHidden ? 'opacity-50' : ''}
      `}
    >
      {leading}
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
        // Reserve the chevron slot on leaf rows so icons align across types.
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
  );
}

interface SortableRowProps extends CommonRowProps {
  isOver: boolean;
}

function SortableLayerRow(props: SortableRowProps) {
  const isLocked = !!props.obj.locked;
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: props.obj.id,
    disabled: isLocked,
  });

  return (
    <>
      <div
        className={`h-0.5 mx-2 rounded transition-colors ${props.isOver ? 'bg-accent' : 'bg-transparent'}`}
      />
      <RowBody
        {...props}
        rootRef={setNodeRef}
        rootAttrs={{ ...attributes, ...(isLocked ? {} : listeners) }}
        isDragging={isDragging}
        leading={
          <DragHandleIcon
            className={`w-2 h-3.5 shrink-0 text-muted transition-opacity ${isLocked ? 'opacity-0' : 'opacity-0 group-hover:opacity-60'}`}
          />
        }
      />
    </>
  );
}

function NestedLayerRow(props: CommonRowProps) {
  // Children of an expanded group don't participate in drag-reorder yet
  // (that lands with the cross-group drag feature). The leading slot
  // stays empty so the row visually aligns with sortable siblings.
  return <RowBody {...props} leading={<span className="w-2 shrink-0" />} />;
}

export function LayersPanel() {
  const t = useT();
  const {
    selectedIds,
    selectObject,
    toggleSelectObject,
    reorderObject,
    updateObjects,
    ungroupIds,
  } = useLabelStore();
  const objects = useCurrentObjects();
  const [overId, setOverId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Flat list of every node anywhere in the tree, used for bulk toggle
  // state lookup when the user clicks a row's eye / lock icon: the
  // selection broadcast logic needs to inspect the clicked object's
  // current value regardless of whether it's nested.
  const allNodes = useMemo(() => [...walkObjects(objects)], [objects]);

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

  const rows = useMemo(() => buildFlatRows(objects, expandedIds), [objects, expandedIds]);

  if (objects.length === 0) {
    return (
      <div className="p-4 text-center text-muted text-xs mt-6">
        {t.layers.empty}
      </div>
    );
  }

  // Drag-reorder only operates on top-level objects (depth=0). Nested
  // rows render but are not part of the SortableContext, so dnd-kit
  // ignores them as drag sources or drop targets.
  const topLevelIds = objects.map((o) => o.id).reverse();
  const n = objects.length;

  const handleDragOver = ({ over }: DragOverEvent) =>
    setOverId((over?.id as string) ?? null);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setOverId(null);
    if (!over || active.id === over.id) return;
    const toVisualIndex = topLevelIds.indexOf(over.id as string);
    if (toVisualIndex === -1) return;
    reorderObject(active.id as string, n - 1 - toVisualIndex);
  };

  const handleDragCancel = () => setOverId(null);

  const commonRowProps = (obj: LabelObject, depth: number): CommonRowProps => ({
    obj,
    depth,
    isSelected: selectedIds.includes(obj.id),
    isExpanded: expandedIds.has(obj.id),
    onSelect: () => selectObject(obj.id),
    onToggle: () => toggleSelectObject(obj.id),
    onToggleLock: () => toggleField(obj.id, 'locked'),
    onToggleVisible: () => toggleField(obj.id, 'visible'),
    onToggleExpand: () => toggleExpand(obj.id),
    onUngroup: () => ungroupIds([obj.id]),
    tLock: t.layers.lock,
    tUnlock: t.layers.unlock,
    tShow: t.layers.show,
    tHide: t.layers.hide,
    tGroup: t.types.group,
    tExpand: t.app.expand,
    tCollapse: t.app.collapse,
    tUngroupLabel: t.layers.ungroup,
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col">
          {rows.map(({ obj, depth }) =>
            depth === 0 ? (
              <SortableLayerRow
                key={obj.id}
                {...commonRowProps(obj, depth)}
                isOver={overId === obj.id}
              />
            ) : (
              <NestedLayerRow key={obj.id} {...commonRowProps(obj, depth)} />
            ),
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}
