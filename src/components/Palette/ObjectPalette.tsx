import { useDraggable } from '@dnd-kit/core';
import { ObjectRegistry } from '../../registry';
import { PALETTE_GROUPS } from './paletteGroups';
import { useT } from '../../lib/useT';
import { useLabelStore } from '../../store/labelStore';
import { mmToDots } from '../../lib/coordinates';
import type { ObjectGroup, ObjectTypeDefinition } from '../../types/ObjectType';
import { resolveDefaultSizeDots } from './resolveDefaultSize';
import { DragHandleIcon } from '../ui/DragHandleIcon';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import type { PaletteDragData } from '../../dnd/types';

interface PaletteEntryProps {
  /** Unique within the palette: registry type or virtual entry id. */
  id: string;
  /** Registry type to instantiate. Equals `id` for non-virtual entries. */
  type: string;
  icon: string;
  label: string;
  defaultSize: ObjectTypeDefinition["defaultSize"];
  propsOverride?: object;
}

function PaletteEntry({ id, type, icon, label, defaultSize, propsOverride }: PaletteEntryProps) {
  const addObject = useLabelStore((s) => s.addObject);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${id}`,
    data: { type, propsOverride } satisfies PaletteDragData,
  });

  const handleDoubleClick = () => {
    const { label: labelConfig } = useLabelStore.getState();
    const size = resolveDefaultSizeDots(defaultSize, labelConfig);
    addObject(
      type,
      {
        x: Math.round(mmToDots(labelConfig.widthMm, labelConfig.dpmm) / 2 - size.width / 2),
        y: Math.round(mmToDots(labelConfig.heightMm, labelConfig.dpmm) / 2 - size.height / 2),
      },
      propsOverride,
    );
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
      <span className="font-mono text-[11px] text-accent w-6 text-center shrink-0">{icon}</span>
      <span className="text-xs text-text">{label}</span>
    </div>
  );
}

interface ResolvedEntry {
  id: string;
  type: string;
  icon: string;
  label: string;
  defaultSize: ObjectTypeDefinition["defaultSize"];
  propsOverride?: object;
}

function resolveEntries(
  group: ObjectGroup,
  types: Record<string, string>,
): ResolvedEntry[] {
  return Object.entries(ObjectRegistry)
    .filter(([, def]) => def.group === group)
    .map(([type, def]): ResolvedEntry => ({
      id: type,
      type,
      icon: def.icon,
      label: types[type] ?? def.label,
      defaultSize: def.defaultSize,
    }));
}

export function ObjectPalette() {
  const t = useT();

  return (
    <div className="p-3 flex flex-col gap-3">
      {PALETTE_GROUPS.map((group) => {
        const entries = resolveEntries(group.key, t.types as Record<string, string>);
        if (entries.length === 0) return null;
        return (
          <CollapsibleSection
            key={group.key}
            id={`palette-${group.key}`}
            title={t.palette[group.labelKey]}
          >
            {entries.map((e) => (
              <PaletteEntry
                key={e.id}
                id={e.id}
                type={e.type}
                icon={e.icon}
                label={e.label}
                defaultSize={e.defaultSize}
                propsOverride={e.propsOverride}
              />
            ))}
          </CollapsibleSection>
        );
      })}
    </div>
  );
}
