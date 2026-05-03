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
import { useLabelStore, useCurrentObjects } from '../../store/labelStore';
import { ObjectRegistry } from '../../registry';
import type { LabelObject } from '../../registry';
import { useT } from '../../lib/useT';
import { DragHandleIcon } from '../ui/DragHandleIcon';

interface RowProps {
  obj: LabelObject;
  isSelected: boolean;
  isOver: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

function SortableLayerRow({ obj, isSelected, isOver, onSelect, onToggle }: RowProps) {
  const def = ObjectRegistry[obj.type];
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: obj.id });

  return (
    <>
      <div
        className={`h-0.5 mx-2 rounded transition-colors ${isOver ? 'bg-accent' : 'bg-transparent'}`}
      />
      <div
        ref={setNodeRef}
        style={{ touchAction: 'none' }}
        {...attributes}
        {...listeners}
        onClick={(e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) onToggle();
          else onSelect();
        }}
        className={`
          flex items-center gap-2 px-2 py-1.5
          cursor-grab active:cursor-grabbing
          border-b border-border group transition-colors hover:bg-surface-2
          ${isSelected ? 'bg-surface-2 border-l-2 border-l-accent' : 'border-l-2 border-l-transparent'}
          ${isDragging ? 'opacity-40' : ''}
        `}
      >
        <DragHandleIcon className="w-2 h-3.5 shrink-0 text-muted opacity-0 group-hover:opacity-60 transition-opacity" />
        <span className="font-mono text-xs text-accent shrink-0 w-4 text-center">
          {def?.icon}
        </span>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-xs text-text truncate">{def?.label ?? obj.type}</span>
          <span className="font-mono text-[9px] text-muted">{obj.id.slice(0, 8)}</span>
        </div>
      </div>
    </>
  );
}

export function LayersPanel() {
  const t = useT();
  const { selectedIds, selectObject, toggleSelectObject, reorderObject } = useLabelStore();
  const objects = useCurrentObjects();
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
