import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { EyeIcon, EyeSlashIcon, LockClosedIcon, LockOpenIcon } from '@heroicons/react/16/solid';
import { useLabelStore, useCurrentObjects } from '../../store/labelStore';
import { ObjectRegistry } from '../../registry';
import type { LabelObject } from '../../registry';
import { useT } from '../../lib/useT';
import { buildBulkToggleUpdates, type ToggleField } from '../../lib/bulkToggle';
import { DragHandleIcon } from '../ui/DragHandleIcon';

interface RowProps {
  obj: LabelObject;
  isSelected: boolean;
  isOver: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onToggleLock: () => void;
  onToggleVisible: () => void;
  tLock: string;
  tUnlock: string;
  tShow: string;
  tHide: string;
  tGroup: string;
}

function SortableLayerRow({
  obj,
  isSelected,
  isOver,
  onSelect,
  onToggle,
  onToggleLock,
  onToggleVisible,
  tLock,
  tUnlock,
  tShow,
  tHide,
  tGroup,
}: RowProps) {
  const def = ObjectRegistry[obj.type];
  const isGroupRow = obj.type === 'group';
  const isLocked = !!obj.locked;
  const isHidden = obj.visible === false;
  // Locked rows opt out of @dnd-kit's sortable listeners so the drag handle
  // can't reorder them; the row stays clickable for selection / toggles.
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: obj.id,
    disabled: isLocked,
  });

  const stopRowClick = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <>
      <div
        className={`h-0.5 mx-2 rounded transition-colors ${isOver ? 'bg-accent' : 'bg-transparent'}`}
      />
      <div
        ref={setNodeRef}
        style={{ touchAction: 'none' }}
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
        `}
      >
        <DragHandleIcon
          className={`w-2 h-3.5 shrink-0 text-muted transition-opacity ${isLocked ? 'opacity-0' : 'opacity-0 group-hover:opacity-60'}`}
        />
        <span className="font-mono text-xs text-accent shrink-0 w-4 text-center">
          {isGroupRow ? '⊞' : def?.icon}
        </span>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-xs text-text truncate">
            {isGroupRow ? tGroup : (def?.label ?? obj.type)}
          </span>
          <span className="font-mono text-[9px] text-muted">{obj.id.slice(0, 8)}</span>
        </div>
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
  const { selectedIds, selectObject, toggleSelectObject, reorderObject, updateObjects } = useLabelStore();
  const objects = useCurrentObjects();
  const [overId, setOverId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const toggleField = (clickedId: string, field: ToggleField) => {
    const updates = buildBulkToggleUpdates(objects, selectedIds, clickedId, field);
    if (updates.length > 0) updateObjects(updates);
  };

  if (objects.length === 0) {
    return (
      <div className="p-4 text-center text-muted text-xs mt-6">
        {t.layers.empty}
      </div>
    );
  }

  // Reverse so topmost layer (last in array = front) appears first
  const reversed = [...objects].reverse();
  const n = objects.length;

  const handleDragOver = ({ over }: DragOverEvent) =>
    setOverId((over?.id as string) ?? null);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setOverId(null);
    if (!over || active.id === over.id) return;
    const toVisualIndex = reversed.findIndex((o) => o.id === over.id);
    reorderObject(active.id as string, n - 1 - toVisualIndex);
  };

  const handleDragCancel = () => setOverId(null);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={reversed.map((o) => o.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col">
          {reversed.map((obj) => (
            <SortableLayerRow
              key={obj.id}
              obj={obj}
              isSelected={selectedIds.includes(obj.id)}
              isOver={overId === obj.id}
              onSelect={() => selectObject(obj.id)}
              onToggle={() => toggleSelectObject(obj.id)}
              onToggleLock={() => toggleField(obj.id, 'locked')}
              onToggleVisible={() => toggleField(obj.id, 'visible')}
              tLock={t.layers.lock}
              tUnlock={t.layers.unlock}
              tShow={t.layers.show}
              tHide={t.layers.hide}
              tGroup={t.types.group}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
