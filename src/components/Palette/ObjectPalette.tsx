import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { StarIcon } from '@heroicons/react/16/solid';
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';
import { ObjectRegistry, getEntry } from '../../registry';
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
  isFavorite: boolean;
  onToggleFavorite: () => void;
  favoriteLabel: string;
}

function PaletteEntry({ id, type, icon, label, defaultSize, propsOverride, isFavorite, onToggleFavorite, favoriteLabel }: PaletteEntryProps) {
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
      <span className="text-xs text-text truncate">{label}</span>
      {/* stopPropagation on pointerdown so the star tap doesn't start a drag. */}
      <button
        type="button"
        aria-label={favoriteLabel}
        aria-pressed={isFavorite}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={`ml-auto shrink-0 p-0.5 transition-colors ${
          isFavorite
            ? 'text-accent'
            : 'text-muted opacity-0 group-hover:opacity-100 hover:text-accent'
        }`}
      >
        {isFavorite ? <StarIcon className="w-3.5 h-3.5" /> : <StarOutlineIcon className="w-3.5 h-3.5" />}
      </button>
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

/** Resolve a single registry type to a palette entry (favorites reference
 *  the registry by type rather than duplicating icon/label/size). */
function resolveEntry(
  type: string,
  types: Record<string, string>,
): ResolvedEntry | null {
  const def = getEntry(type);
  if (!def) return null;
  return {
    id: type,
    type,
    icon: def.icon,
    label: types[type] ?? def.label,
    defaultSize: def.defaultSize,
  };
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
  const favorites = useLabelStore((s) => s.paletteFavorites);
  const toggleFavorite = useLabelStore((s) => s.toggleFavorite);
  const q = query.trim().toLowerCase();
  const types = t.types as Record<string, string>;
  const favSet = new Set(favorites);

  // Resolve + filter every group once; drop empty groups so search collapses
  // the list to just the hits (and the no-results branch can fire).
  const groups = PALETTE_GROUPS.map((group) => ({
    group,
    entries: resolveEntries(group.key, types).filter(
      (e) => !q || e.label.toLowerCase().includes(q),
    ),
  })).filter((g) => g.entries.length > 0);

  // Favorites keep their pin order; drop ids whose type no longer exists.
  const favEntries = favorites
    .map((type) => resolveEntry(type, types))
    .filter((e): e is ResolvedEntry => e !== null);

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
        isFavorite={favSet.has(e.type)}
        onToggleFavorite={() => toggleFavorite(e.type)}
        favoriteLabel={favSet.has(e.type) ? t.palette.unpinFavorite : t.palette.pinFavorite}
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

        {/* Favorites pinned on top, only when not searching. */}
        {!q && (
          <CollapsibleSection
            id="palette-favorites"
            title={<GroupTitle label={t.palette.favorites} count={favEntries.length} />}
          >
            {favEntries.length > 0 ? (
              renderEntries(favEntries)
            ) : (
              <p className="text-xs text-muted px-1 py-1">{t.palette.favoritesHint}</p>
            )}
          </CollapsibleSection>
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
