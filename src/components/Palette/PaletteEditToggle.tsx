import { useLabelStore } from '../../store/labelStore';
import { useT } from '../../lib/useT';

/** "Edit / Done" switch for the curated type-list, shown in the sidebar collapse
 *  bar. Only meaningful in list view; hidden otherwise. Editing toggles the rows
 *  between drag-to-canvas and reorder/remove/add (see ObjectPalette). */
export function PaletteEditToggle() {
  const t = useT();
  const view = useLabelStore((s) => s.paletteView);
  const editing = useLabelStore((s) => s.paletteEditing);
  const toggle = useLabelStore((s) => s.togglePaletteEditing);
  if (view !== 'favorites') return null;
  return (
    <button
      type="button"
      aria-pressed={editing}
      onClick={toggle}
      className={`text-[11px] px-1 py-0.5 rounded transition-colors ${
        editing ? 'text-accent' : 'text-muted hover:text-text'
      }`}
    >
      {editing ? t.palette.editDone : t.palette.editList}
    </button>
  );
}
