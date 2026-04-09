import { useState } from 'react';
import { useLabelStore } from '../../store/labelStore';
import { ObjectRegistry } from '../../registry';
import t from '../../locales/en';

export function LayersPanel() {
  const {
    objects,
    selectedId,
    selectObject,
    reorderObject,
  } = useLabelStore();

  // Visual index (in reversed list) of the drop target gap
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

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

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Prevent the canvas palette drag handler from picking this up
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, visualIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIndex(visualIndex);
  };

  const handleDrop = (e: React.DragEvent, visualIndex: number) => {
    e.preventDefault();
    if (!dragId) return;
    // Convert visual index → array index (reversed list)
    const toArrayIndex = n - 1 - visualIndex;
    reorderObject(dragId, toArrayIndex);
    setOverIndex(null);
    setDragId(null);
  };

  const handleDragEnd = () => {
    setOverIndex(null);
    setDragId(null);
  };

  return (
    <div
      className="flex flex-col"
      onDragLeave={(e) => {
        // Only clear when leaving the panel entirely
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setOverIndex(null);
        }
      }}
    >
      {reversed.map((obj, i) => {
        const def = ObjectRegistry[obj.type];
        const isSelected = obj.id === selectedId;
        const isDragging = obj.id === dragId;

        return (
          <div key={obj.id}>
            {/* Drop indicator above this row */}
            <div
              className={`h-0.5 mx-2 rounded transition-colors ${overIndex === i ? 'bg-accent' : 'bg-transparent'}`}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
            />

            <div
              draggable
              onDragStart={(e) => handleDragStart(e, obj.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              onClick={() => selectObject(obj.id)}
              className={`flex items-center gap-2 px-2 py-1.5 cursor-grab active:cursor-grabbing border-b border-border group transition-colors hover:bg-surface-2 ${
                isSelected ? 'bg-surface-2 border-l-2 border-l-accent' : 'border-l-2 border-l-transparent'
              } ${isDragging ? 'opacity-40' : ''}`}
            >
              <span className="font-mono text-xs text-accent shrink-0 w-4 text-center">
                {def?.icon}
              </span>

              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-xs text-text truncate">{def?.label ?? obj.type}</span>
                <span className="font-mono text-[9px] text-muted">{obj.id.slice(0, 8)}</span>
              </div>

            </div>
          </div>
        );
      })}

      {/* Drop indicator after last row */}
      <div
        className={`h-0.5 mx-2 rounded transition-colors ${overIndex === n ? 'bg-accent' : 'bg-transparent'}`}
        onDragOver={(e) => handleDragOver(e, n)}
        onDrop={(e) => handleDrop(e, n)}
      />
    </div>
  );
}
