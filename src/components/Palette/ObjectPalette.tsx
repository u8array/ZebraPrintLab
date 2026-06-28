import { useState } from 'react';
import { useDraggable, useDndMonitor } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDownIcon, MinusIcon, PlusIcon } from '@heroicons/react/16/solid';
import { PALETTE_GROUPS } from './paletteGroups';
import { addablesInGroup, resolveAddable, type AddableEntry } from '../../registry/palettePresets';
import { PALETTE_TYPES, variantsOfType } from '../../registry/paletteTypes';
import { useT } from '../../lib/useT';
import { useLabelStore } from '../../store/labelStore';
import { printableRectDots } from '../../lib/objectBounds';
import { resolveDefaultSizeDots } from '../../lib/resolveDefaultSize';
import { DragHandleIcon } from '../ui/DragHandleIcon';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { inputCls } from '../ui/formStyles';
import { rowDragId, isRowDragId, ROW_PREFIX, type PaletteDragData } from '../../dnd/types';
import type { Translations } from '../../locales';
import type { PaletteRow } from '../../store/slices/uiSlice';

/** Curated-type name: reuses the registry/group labels; only "Form" is new. */
function typeLabel(typeId: string, t: Translations): string {
  switch (typeId) {
    case 'shape': return t.palette.typeForm;
    case 'code-1d': return t.palette.groupCode1d;
    case 'code-2d': return t.palette.groupCode2d;
    case 'code-postal': return t.palette.groupCodePostal;
    default: return (t.types as Record<string, string>)[typeId] ?? typeId;
  }
}

/** Drop an entry centred on the visible (printable) label area, which ^LS can
 *  shift off the physical center (double-click / "no drag" path). */
function spawnCentered(entry: AddableEntry) {
  const addObject = useLabelStore.getState().addObject;
  const { label } = useLabelStore.getState();
  const size = resolveDefaultSizeDots(entry.defaultSize, label);
  const r = printableRectDots(label);
  addObject(
    entry.type,
    {
      x: Math.round(r.x + r.width / 2 - size.width / 2),
      y: Math.round(r.y + r.height / 2 - size.height / 2),
    },
    entry.propsOverride,
  );
}

const rowBodyCls =
  'group flex items-center gap-2 px-1.5 py-1.5 rounded border border-transparent hover:border-border-2 hover:bg-surface-2 cursor-grab active:cursor-grabbing select-none transition-colors';
const gripCls =
  '-mr-1 shrink-0 p-0.5 rounded cursor-grab active:cursor-grabbing text-muted opacity-40 group-hover:opacity-70 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent transition-opacity';

function IconSlot({ entry }: { entry: AddableEntry }) {
  const showZpl = useLabelStore((s) => s.showZplCommands);
  // Fixed-width slot so toggling glyph vs command badge never shifts the label.
  return (
    <span className="w-8 shrink-0 flex justify-center">
      {showZpl && entry.zplCmd ? (
        <span className="bg-accent-dim text-accent font-mono text-[10px] leading-none rounded px-1 py-0.5">{entry.zplCmd}</span>
      ) : (
        <span className="font-mono text-[11px] text-muted group-hover:text-accent transition-colors">{entry.icon}</span>
      )}
    </span>
  );
}

/** Flat / search entry: plain draggable that spawns on canvas drop (handled by
 *  LabelCanvas's drag monitor reading the drag data). */
function FlatEntry({ entry, dragId, cat }: { entry: AddableEntry; dragId: string; cat?: string }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: `pal-${dragId}`,
    data: { type: entry.type, propsOverride: entry.propsOverride } satisfies PaletteDragData,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      onDoubleClick={() => spawnCentered(entry)}
      style={{ touchAction: 'pan-y' }}
      className={`${rowBodyCls} ${isDragging ? 'opacity-40' : ''}`}
    >
      <button ref={setActivatorNodeRef} type="button" aria-label={entry.label} {...attributes} className={gripCls}>
        <DragHandleIcon className="w-2 h-3.5" />
      </button>
      <IconSlot entry={entry} />
      <span className="text-xs text-text truncate">{entry.label}</span>
      {cat && <span className="ml-auto shrink-0 font-mono text-[9px] text-muted">{cat}</span>}
    </div>
  );
}

/** List-mode row: a curated {type,variant} instance. In normal mode the grip
 *  drags onto the canvas to spawn and the chevron picks the variant; in edit
 *  mode the grip reorders and a remove button appears (see PaletteEditToggle). */
function ListRow({ row, index, editing }: { row: PaletteRow; index: number; editing: boolean }) {
  const { type, variant } = row;
  const t = useT();
  const setVariant = useLabelStore((s) => s.setPaletteRowVariant);
  const removeRow = useLabelStore((s) => s.removePaletteRow);
  const [open, setOpen] = useState(false);
  const entry = resolveAddable(variant, t);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: rowDragId(row.id),
    // Spawn the chosen variant's registry type, not the curated palette type.
    data: { type: entry?.type ?? type, propsOverride: entry?.propsOverride } satisfies PaletteDragData,
  });
  if (!entry) return null;
  const variants = variantsOfType(type);
  const showChevron = !editing && variants.length > 1;
  // Keep the active row in place (only neighbours shift); a pointer-following
  // transform would overflow the scroll container and add an x-scrollbar.
  const style = {
    transform: isDragging || !transform ? undefined : `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-40' : ''}>
      <div
        {...listeners}
        onDoubleClick={editing ? undefined : () => spawnCentered(entry)}
        style={{ touchAction: 'pan-y' }}
        className={`${rowBodyCls} ${editing ? 'border-border-2' : ''}`}
      >
        <button ref={setActivatorNodeRef} type="button" aria-label={entry.label} {...attributes} className={gripCls}>
          <DragHandleIcon className="w-2 h-3.5" />
        </button>
        <IconSlot entry={entry} />
        <span className="flex flex-col min-w-0 leading-tight">
          <span className="text-xs text-text truncate">{entry.label}</span>
          <span className="font-mono text-[9px] text-muted truncate">{typeLabel(type, t)}</span>
        </span>
        {showChevron && (
          <button
            type="button"
            aria-label={t.palette.pickVariant}
            aria-expanded={open}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            className="ml-auto shrink-0 p-0.5 rounded text-muted hover:text-text"
          >
            <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
          </button>
        )}
        {editing && (
          <button
            type="button"
            aria-label={t.palette.removeRow}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); removeRow(index); }}
            className="ml-auto shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-error text-white hover:opacity-80 transition-opacity"
          >
            <MinusIcon className="w-3 h-3" />
          </button>
        )}
      </div>
      {open && !editing && (
        <div className="ml-8 mt-0.5 mb-1 flex flex-col gap-0.5 border-l border-border pl-1">
          {variants.map((v) => {
            const ve = resolveAddable(v, t);
            if (!ve) return null;
            return (
              <button
                key={v}
                type="button"
                onClick={() => { setVariant(index, v); setOpen(false); }}
                className={`flex items-center gap-2 px-1.5 py-1 rounded text-left transition-colors ${v === variant ? 'text-accent' : 'text-text hover:bg-surface-2'}`}
              >
                <span className="font-mono text-[11px] text-muted w-4 text-center">{ve.icon}</span>
                <span className="text-xs truncate">{ve.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddTypeMenu() {
  const t = useT();
  const addPaletteRow = useLabelStore((s) => s.addPaletteRow);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1.5 w-full rounded text-xs font-mono border border-dashed border-border text-muted hover:text-text hover:border-border-2 transition-colors"
      >
        <PlusIcon className="w-3 h-3 text-accent" />
        {t.palette.addType}
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-0.5 rounded border border-border bg-surface p-1">
          {PALETTE_TYPES.map((pt) => (
            <button
              key={pt.id}
              type="button"
              onClick={() => { addPaletteRow(pt.id); setOpen(false); }}
              className="px-2 py-1 rounded text-left text-xs text-text hover:bg-surface-2 transition-colors"
            >
              {typeLabel(pt.id, t)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const rows = useLabelStore((s) => s.paletteRows);
  const view = useLabelStore((s) => s.paletteView);
  const editing = useLabelStore((s) => s.paletteEditing);
  const reorderRows = useLabelStore((s) => s.reorderPaletteRows);
  const q = query.trim().toLowerCase();

  // Reorder list rows. Only active in edit mode; normal-mode row drags spawn on
  // canvas (handled by LabelCanvas's monitor) and never reach a sibling row.
  useDndMonitor({
    onDragEnd({ active, over }) {
      if (!editing) return;
      const a = String(active.id);
      const o = over ? String(over.id) : '';
      if (!isRowDragId(a) || !isRowDragId(o) || a === o) return;
      reorderRows(a.slice(ROW_PREFIX.length), o.slice(ROW_PREFIX.length));
    },
  });

  // Flat list across every group (registry types + presets); the basis for both
  // flat mode and search.
  const flatGroups = PALETTE_GROUPS.map((group) => ({
    group,
    entries: addablesInGroup(group.key, t).filter((e) => !q || e.label.toLowerCase().includes(q)),
  })).filter((g) => g.entries.length > 0);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 bg-surface border-b border-border px-2 pt-3 pb-2 flex flex-col gap-2">
        <input
          type="search"
          className={inputCls}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.palette.searchPlaceholder}
          aria-label={t.palette.searchPlaceholder}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 pt-2 flex flex-col gap-3">
        {q ? (
          flatGroups.length === 0 ? (
            <p className="text-xs text-muted px-1">{t.palette.noResults.replace('{q}', () => query.trim())}</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {flatGroups.flatMap(({ group, entries }) =>
                entries.map((e) => (
                  <FlatEntry key={`${group.key}-${e.id}`} entry={e} dragId={`search-${group.key}-${e.id}`} cat={t.palette[group.labelKey]} />
                )),
              )}
            </div>
          )
        ) : view === 'list' ? (
          <>
            <SortableContext items={rows.map((r) => rowDragId(r.id))} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-0.5">
                {rows.map((r, i) => (
                  <ListRow key={r.id} row={r} index={i} editing={editing} />
                ))}
              </div>
            </SortableContext>
            {editing && <AddTypeMenu />}
          </>
        ) : (
          flatGroups.map(({ group, entries }) => (
            <CollapsibleSection
              key={group.key}
              id={`palette-${group.key}`}
              title={<GroupTitle label={t.palette[group.labelKey]} count={entries.length} />}
            >
              {entries.map((e) => (
                <FlatEntry key={`${group.key}-${e.id}`} entry={e} dragId={`flat-${group.key}-${e.id}`} />
              ))}
            </CollapsibleSection>
          ))
        )}
      </div>
    </div>
  );
}
