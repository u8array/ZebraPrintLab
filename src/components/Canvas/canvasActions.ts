import type { ZOrderDir } from "../../lib/zorder";

/** One context-menu entry. `labelKey` resolves against `t.contextMenu`; a raw
 *  `label` overrides it (dynamic entries like the add-object types). A
 *  `submenu` makes it a parent row. */
export interface MenuAction {
  id: string;
  labelKey?: string;
  label?: string;
  run?: () => void;
  disabled?: boolean;
  danger?: boolean;
  submenu?: MenuAction[];
}

/** Actions are grouped into divider-separated sections. */
export interface MenuSection {
  id: string;
  items: MenuAction[];
}

/** What the right-click targeted plus the capabilities + dispatchers needed to
 *  build the menu. Kept data-only (no Konva/React) so the builder is pure and
 *  unit-testable; the canvas assembles it and resolves labels. */
export interface ContextMenuCtx {
  /** Right-clicked an object/selection vs empty canvas. */
  onObject: boolean;
  hasSelection: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  canDelete: boolean;
  locked: boolean;
  hasClipboard: boolean;
  hasObjects: boolean;
  previewLocks: boolean;
  /** "Add object here" types, grouped + labelled by the caller (mirrors the
   *  palette categories; first group is favorites when any are pinned). Each
   *  group becomes a submenu, its types the third level. */
  addableGroups: { id: string; label: string; types: { id: string; type: string; label: string; propsOverride?: object }[] }[];
  dispatch: {
    copy: () => void;
    cut: () => void;
    duplicate: () => void;
    remove: () => void;
    pasteHere: () => void;
    reorder: (dir: ZOrderDir) => void;
    group: () => void;
    ungroup: () => void;
    toggleLock: () => void;
    addHere: (type: string, propsOverride?: object) => void;
    copyZplSelected: () => void;
    copyZplLabel: () => void;
    copyImage: () => void;
    exportImage: () => void;
    selectAll: () => void;
  };
}

/** Build the context-menu sections for a right-click. Empty sections are
 *  dropped, so the caller can render dividers between whatever remains. During
 *  a Labelary preview lock everything is disabled. */
export function buildContextMenu(ctx: ContextMenuCtx): MenuSection[] {
  const d = ctx.dispatch;
  const off = ctx.previewLocks;
  const sel = ctx.hasSelection && ctx.onObject;

  const sections: MenuSection[] = [];

  if (sel) {
    const clipboard: MenuAction[] = [
      { id: "copy", labelKey: "copy", run: d.copy, disabled: off },
      // Cut removes, so it needs the same deletable guard as Delete.
      { id: "cut", labelKey: "cut", run: d.cut, disabled: off || !ctx.canDelete },
      { id: "duplicate", labelKey: "duplicate", run: d.duplicate, disabled: off },
    ];
    // Paste lands between the copy group and the destructive delete.
    if (ctx.hasClipboard) {
      clipboard.push({ id: "pasteHere", labelKey: "pasteHere", run: d.pasteHere, disabled: off });
    }
    clipboard.push({
      id: "delete",
      labelKey: "delete",
      run: d.remove,
      disabled: off || !ctx.canDelete,
      danger: true,
    });
    sections.push({ id: "clipboard", items: clipboard });
    // Lock blocks reordering, matching delete/group/ungroup.
    const orderOff = off || ctx.locked;
    sections.push({
      id: "order",
      items: [
        { id: "toFront", labelKey: "bringToFront", run: () => d.reorder("front"), disabled: orderOff },
        { id: "forward", labelKey: "bringForward", run: () => d.reorder("forward"), disabled: orderOff },
        { id: "backward", labelKey: "sendBackward", run: () => d.reorder("backward"), disabled: orderOff },
        { id: "toBack", labelKey: "sendToBack", run: () => d.reorder("back"), disabled: orderOff },
      ],
    });
    const arrange: MenuAction[] = [];
    if (ctx.canGroup) arrange.push({ id: "group", labelKey: "group", run: d.group, disabled: off });
    if (ctx.canUngroup) arrange.push({ id: "ungroup", labelKey: "ungroup", run: d.ungroup, disabled: off });
    arrange.push({
      id: "lock",
      labelKey: ctx.locked ? "unlock" : "lock",
      run: d.toggleLock,
      disabled: off,
    });
    sections.push({ id: "arrange", items: arrange });
    sections.push({
      id: "export-sel",
      items: [
        { id: "copyZplSelected", labelKey: "copyZplSelected", run: d.copyZplSelected, disabled: off },
        { id: "copyImage", labelKey: "copyImage", run: d.copyImage, disabled: off },
        { id: "exportImage", labelKey: "exportImage", run: d.exportImage, disabled: off },
      ],
    });
  } else {
    // Empty-canvas menu.
    sections.push({
      id: "place",
      items: [
        { id: "pasteHere", labelKey: "pasteHere", run: d.pasteHere, disabled: off || !ctx.hasClipboard },
        {
          id: "addHere",
          labelKey: "addObjectHere",
          disabled: off || ctx.addableGroups.length === 0,
          submenu: ctx.addableGroups.map((g) => ({
            id: `addgrp:${g.id}`,
            label: g.label,
            disabled: off,
            submenu: g.types.map((a) => ({
              id: `add:${a.id}`,
              label: a.label,
              run: () => d.addHere(a.type, a.propsOverride),
              disabled: off,
            })),
          })),
        },
        { id: "selectAll", labelKey: "selectAll", run: d.selectAll, disabled: off || !ctx.hasObjects },
      ],
    });
    sections.push({
      id: "export-label",
      items: [
        { id: "copyZplLabel", labelKey: "copyZplLabel", run: d.copyZplLabel, disabled: off || !ctx.hasObjects },
        { id: "copyImage", labelKey: "copyImage", run: d.copyImage, disabled: off || !ctx.hasObjects },
        { id: "exportImage", labelKey: "exportImage", run: d.exportImage, disabled: off || !ctx.hasObjects },
      ],
    });
  }

  return sections.filter((s) => s.items.length > 0);
}
