import { useDraggable } from '@dnd-kit/core';
import { ObjectRegistry } from '../../registry';
import { PALETTE_GROUPS } from './paletteGroups';
import type { ObjectTypeDefinition } from '../../types/ObjectType';
import { useT } from '../../lib/useT';
import { useLabelStore } from '../../store/labelStore';
import { mmToDots } from '../../lib/coordinates';
import { DragHandleIcon } from '../ui/DragHandleIcon';
import type { PaletteDragData } from '../../dnd/types';

interface PaletteEntryProps {
  type: string;
  def: ObjectTypeDefinition;
}

function PaletteEntry({ type, def }: PaletteEntryProps) {
  const t = useT();
  const addObject = useLabelStore((s) => s.addObject);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { type } satisfies PaletteDragData,
  });

  const handleDoubleClick = () => {
    const { label } = useLabelStore.getState();
    addObject(type, {
      x: Math.round(mmToDots(label.widthMm, label.dpmm) / 2 - def.defaultSize.width / 2),
      y: Math.round(mmToDots(label.heightMm, label.dpmm) / 2 - def.defaultSize.height / 2),
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={{ touchAction: 'none' }}
      {...attributes}
      {...listeners}
      onDoubleClick={handleDoubleClick}
      className={`
        group flex items-center gap-2.5 px-2 py-2 rounded
        border border-transparent
        hover:border-border-2 hover:bg-surface-2
        cursor-grab active:cursor-grabbing select-none
        transition-colors
        ${isDragging ? 'opacity-40' : ''}
      `}
    >
      <DragHandleIcon className="w-2 h-3.5 shrink-0 text-muted opacity-0 group-hover:opacity-60 transition-opacity" />
      <span className="font-mono text-[11px] text-accent w-6 text-center shrink-0">
        {def.icon}
      </span>
      <span className="text-xs text-text">
        {(t.types as Record<string, string>)[type] ?? def.label}
      </span>
    </div>
  );
}

export function ObjectPalette() {
  const t = useT();

  return (
    <div className="p-3 flex flex-col gap-3">
      {PALETTE_GROUPS.map((group) => {
        const entries = Object.entries(ObjectRegistry).filter(
          ([, def]) => def.group === group.key,
        );
        if (entries.length === 0) return null;
        return (
          <div key={group.key} className="flex flex-col gap-0.5">
            <p className="font-mono text-[10px] font-medium text-muted uppercase tracking-widest px-1 pt-1 pb-1.5">
              {t.palette[group.labelKey]}
            </p>
            {entries.map(([type, def]) => (
              <PaletteEntry key={type} type={type} def={def} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
