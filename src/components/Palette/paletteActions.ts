import type { MenuAction, MenuSection } from "../ui/ContextMenu";

/** Labels arrive resolved so the builders stay pure and locale-free. */
export interface PaletteRowMenuCtx {
  pinned: boolean;
  labels: { addToLabel: string; pinToFavorites: string; unpinFromFavorites: string };
  dispatch: {
    addToLabel: () => void;
    /** Adds or removes the favorites row for this entry (one row per entry). */
    togglePin: () => void;
  };
}

/** Right-click menu for a palette row (browse, search, or favorites). */
export function buildPaletteRowMenu(ctx: PaletteRowMenuCtx): MenuSection[] {
  return [
    {
      id: "row",
      items: [
        { id: "addToLabel", label: ctx.labels.addToLabel, run: ctx.dispatch.addToLabel },
        {
          id: "togglePin",
          label: ctx.pinned ? ctx.labels.unpinFromFavorites : ctx.labels.pinToFavorites,
          run: ctx.dispatch.togglePin,
        },
      ],
    },
  ];
}

export interface AddMenuGroup {
  id: string;
  label: string;
  entries: { id: string; label: string; pinned: boolean }[];
}

/** Favorites "add object" menu: one level of category submenus (the palette
 *  groups), entries already pinned are disabled instead of hidden so the
 *  catalog reads the same regardless of curation state. */
export function buildFavoritesAddMenu(
  groups: readonly AddMenuGroup[],
  onAdd: (entryId: string) => void,
): MenuSection[] {
  const items: MenuAction[] = groups
    .filter((g) => g.entries.length > 0)
    .map((g) => ({
      id: `grp:${g.id}`,
      label: g.label,
      submenu: g.entries.map((e) => ({
        id: `add:${e.id}`,
        label: e.label,
        disabled: e.pinned,
        run: () => onAdd(e.id),
      })),
    }));
  return [{ id: "add", items }];
}
