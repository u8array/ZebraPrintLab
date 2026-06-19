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
  /** Primary ZPL command, shown in the icon slot in power-user mode. */
  zplCmd?: string;
  label: string;
  defaultSize: ObjectTypeDefinition["defaultSize"];
  propsOverride?: object;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  favoriteLabel: string;
}

function PaletteEntry({ id, type, icon, zplCmd, label, defaultSize, propsOverride, isFavorite, onToggleFavorite, favoriteLabel }: PaletteEntryProps) {
  const addObject = useLabelStore((s) => s.addObject);
  const showZplCommands = useLabelStore((s) => s.showZplCommands);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
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
    // Pointer-drag listeners live on the whole row so it's grabbable anywhere;
    // keyboard activation + role=button stay on the grip (setActivatorNodeRef +
    // attributes) so the row is a plain div, not an interactive element wrapping
    // the star button. Double-click still spawns.
    <div
      ref={setNodeRef}
      {...listeners}
      onDoubleClick={handleDoubleClick}
      // pan-y, not none: lets touch users still scroll the palette list
      // vertically while a horizontal drag onto the canvas starts a drag.
      style={{ touchAction: 'pan-y' }}
      className={`
        group flex items-center gap-2 px-1.5 py-1.5 rounded
        border border-transparent
        hover:border-border-2 hover:bg-surface-2
        cursor-grab active:cursor-grabbing select-none transition-colors
        ${isDragging ? 'opacity-40' : ''}
      `}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={label}
        {...attributes}
        className="-mr-1 shrink-0 p-0.5 rounded cursor-grab active:cursor-grabbing text-muted opacity-40 group-hover:opacity-70 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent transition-opacity"
      >
        <DragHandleIcon className="w-2 h-3.5" />
      </button>
      {/* Fixed-width slot so toggling command/glyph never shifts the label. */}
      <span className="w-8 shrink-0 flex justify-center">
        {showZplCommands && zplCmd ? (
          <span className="bg-accent-dim text-accent font-mono text-[10px] leading-none rounded px-1 py-0.5">{zplCmd}</span>
        ) : (
          <span className="font-mono text-[11px] text-muted group-hover:text-accent transition-colors">{icon}</span>
        )}
      </span>
      <span className="text-xs text-text truncate">{label}</span>
      {/* Stop pointerdown (the row's drag activator), click, and dblclick (the
          row's double-click spawns an object) so a star tap only toggles and a
          small drag on the star never starts a palette drag. */}
      <button
        type="button"
        aria-label={favoriteLabel}
        aria-pressed={isFavorite}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={`ml-auto shrink-0 p-0.5 rounded transition-colors focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
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
  zplCmd?: string;
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
    .map(([type]) => resolveEntry(type, types))
    .filter((e): e is ResolvedEntry => e !== null);
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
    zplCmd: def.zplCmd,
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

  // `scope` keeps drag ids unique: a favorited type renders both in the
  // Favorites section and its own group, so the draggable id is scoped per
  // render site while the drag data (type) stays identical.
  const renderEntries = (entries: ResolvedEntry[], scope: string) =>
    entries.map((e) => (
      <PaletteEntry
        key={`${scope}-${e.id}`}
        id={`${scope}-${e.id}`}
        type={e.type}
        icon={e.icon}
        zplCmd={e.zplCmd}
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
      <div className="shrink-0 bg-surface border-b border-border px-2 pt-3 pb-2">
        <input
          type="search"
          className={inputCls}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.palette.searchPlaceholder}
          aria-label={t.palette.searchPlaceholder}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 flex flex-col gap-3">
        {q && groups.length === 0 && (
          <p className="text-xs text-muted px-1">
            {t.palette.noResults.replace('{q}', () => query.trim())}
          </p>
        )}

        {/* Favorites pinned on top, only when not searching. */}
        {!q && (
          <CollapsibleSection
            id="palette-favorites"
            title={<GroupTitle label={t.palette.favorites} count={favEntries.length} />}
          >
            {favEntries.length > 0 ? (
              renderEntries(favEntries, 'favorites')
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
              {renderEntries(entries, group.key)}
            </div>
          ) : (
            <CollapsibleSection
              key={group.key}
              id={`palette-${group.key}`}
              title={<GroupTitle label={t.palette[group.labelKey]} count={entries.length} />}
            >
              {renderEntries(entries, group.key)}
            </CollapsibleSection>
          ),
        )}
      </div>
    </div>
  );
}
