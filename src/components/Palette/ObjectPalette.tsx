import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ObjectRegistry } from '../../registry';
import { PALETTE_GROUPS } from './paletteGroups';
import { useT } from '../../lib/useT';
import { useLabelStore } from '../../store/labelStore';
import { mmToDots } from '../../lib/coordinates';
import type { ObjectGroup } from '../../types/LabelObject';
import type { ObjectTypeDefinition } from '../../types/ObjectType';
import { resolveDefaultSizeDots } from '../../lib/resolveDefaultSize';
import { DragHandleIcon } from '../ui/DragHandleIcon';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { inputCls } from '../ui/formStyles';
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
        group flex items-center gap-2.5 px-2 py-1.5 rounded
        border border-transparent
        hover:border-border-2 hover:bg-surface-2
        cursor-grab active:cursor-grabbing select-none
        transition-colors
        ${isDragging ? 'opacity-40' : ''}
      `}
    >
      <DragHandleIcon className="w-2 h-3.5 shrink-0 text-muted opacity-0 group-hover:opacity-60 transition-opacity" />
      <span className="font-mono text-[11px] text-muted group-hover:text-accent w-6 text-center shrink-0 transition-colors">{icon}</span>
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

/** Entry-count badge shown beside a group title. */
function GroupTitle({ label, count }: { label: string; count: number }) {
  return (
    <>
      {label}
      <span className="ml-1.5 normal-case font-normal text-muted">{count}</span>
    </>
  );
}

export function ObjectPalette() {
  const t = useT();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  // Resolve + filter every group once; drop empty groups so search collapses
  // the list to just the hits (and the no-results branch can fire).
  const groups = PALETTE_GROUPS.map((group) => ({
    group,
    entries: resolveEntries(group.key, t.types as Record<string, string>).filter(
      (e) => !q || e.label.toLowerCase().includes(q),
    ),
  })).filter((g) => g.entries.length > 0);

  const renderEntries = (entries: ResolvedEntry[]) =>
    entries.map((e) => (
      <PaletteEntry
        key={e.id}
        id={e.id}
        type={e.type}
        icon={e.icon}
        label={e.label}
        defaultSize={e.defaultSize}
        propsOverride={e.propsOverride}
      />
    ));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 bg-surface border-b border-border px-3 pt-3 pb-2">
        <input
          type="search"
          className={inputCls}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.palette.searchPlaceholder}
          aria-label={t.palette.searchPlaceholder}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col gap-3">
        {q && groups.length === 0 && (
          <p className="text-xs text-muted px-1">
            {t.palette.noResults.replace('{q}', query.trim())}
          </p>
        )}

        {groups.map(({ group, entries }) =>
          // While searching, render flat always-open groups so every hit is
          // visible; the collapsible (persisted) groups return when search clears.
          q ? (
            <div key={group.key} className="flex flex-col gap-0.5">
              <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted px-1 pb-1">
                <GroupTitle label={t.palette[group.labelKey]} count={entries.length} />
              </p>
              {renderEntries(entries)}
            </div>
          ) : (
            <CollapsibleSection
              key={group.key}
              id={`palette-${group.key}`}
              title={<GroupTitle label={t.palette[group.labelKey]} count={entries.length} />}
            >
              {renderEntries(entries)}
            </CollapsibleSection>
          ),
        )}
      </div>
    </div>
  );
}
