import { useMemo, useState } from 'react';
import { DndContext } from '@dnd-kit/core';
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
import { buildFlatRows, useLayerDnd, INDENT_STEP, type FlatRow } from './useLayerDnd';

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
}: RowProps) {
  const t = useT();
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
          title={isExpanded ? t.app.collapse : t.app.expand}
          aria-label={isExpanded ? t.app.collapse : t.app.expand}
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
          {groupRow ? t.types.group : (def?.label ?? obj.type)}
        </span>
        <span className="font-mono text-[9px] text-muted">{obj.id.slice(0, 8)}</span>
      </div>
      {groupRow && (
        <button
          type="button"
          onPointerDown={stopRowClick}
          onClick={(e) => { stopRowClick(e); onUngroup(); }}
          title={t.layers.ungroup}
          aria-label={t.layers.ungroup}
          className="w-5 h-5 flex items-center justify-center rounded transition-colors text-muted opacity-0 group-hover:opacity-100 hover:text-text hover:bg-surface"
        >
          <LinkSlashIcon className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        type="button"
        onPointerDown={stopRowClick}
        onClick={(e) => { stopRowClick(e); onToggleVisible(); }}
        title={isHidden ? t.layers.show : t.layers.hide}
        aria-label={isHidden ? t.layers.show : t.layers.hide}
        className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${isHidden ? 'text-accent' : 'text-muted opacity-0 group-hover:opacity-100'} hover:text-text hover:bg-surface`}
      >
        {isHidden ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onPointerDown={stopRowClick}
        onClick={(e) => { stopRowClick(e); onToggleLock(); }}
        title={isLocked ? t.layers.unlock : t.layers.lock}
        aria-label={isLocked ? t.layers.unlock : t.layers.lock}
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const allNodes = useMemo(() => [...walkObjects(objects)], [objects]);
  const rows = useMemo(() => buildFlatRows(objects, expandedIds), [objects, expandedIds]);
  const rowsById = useMemo(() => {
    const m = new Map<string, FlatRow>();
    for (const r of rows) m.set(r.obj.id, r);
    return m;
  }, [rows]);

  const {
    sensors,
    collisionDetection,
    panelRef,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
    preview,
  } = useLayerDnd({ objects, rowsById, expandedIds, reparentObject });

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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
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
              isDropTarget={preview.dropIntoTargetId === obj.id}
              showInsertionLine={preview.insertionLineRowId === obj.id}
              insertionLineDepth={
                preview.insertionLineRowId === obj.id ? preview.insertionLineDepth : null
              }
              onSelect={() => selectObject(obj.id)}
              onToggle={() => toggleSelectObject(obj.id)}
              onToggleLock={() => toggleField(obj.id, 'locked')}
              onToggleVisible={() => toggleField(obj.id, 'visible')}
              onToggleExpand={() => toggleExpand(obj.id)}
              onUngroup={() => ungroupIds([obj.id])}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
