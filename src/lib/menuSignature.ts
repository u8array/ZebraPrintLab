import type { HistorySubmenu, MenuModel, MenuSection, SubmenuLabels } from './menuModel';

/** Structure key: rebuild (menubar swap, flickers) only when the menu's SHAPE
 *  changes (OS glyph theme + item id lists); labels/enabled/history patch in
 *  place, so a locale switch or row-count change never swaps the menubar.
 *  `macAppMenuLabel` (macOS only) keys the un-patched app-submenu text, so a
 *  locale switch rebuilds the mac menubar (a cheap swap there, unlike Windows). */
export function menuStructureKey(dark: boolean, model: MenuModel, macAppMenuLabel?: string): string {
  const ids = (sections: MenuSection[]) => sections.map((s) => s.map((i) => i.id));
  return JSON.stringify([dark, ids(model.file), ids(model.edit), ids(model.help), macAppMenuLabel]);
}

/** Effect-dep signature: everything the built menu shows, so the update effect
 *  re-runs on any visible change even when the structure key (and menubar) do
 *  not. */
export function menuContentSignature(
  dark: boolean,
  submenuLabels: SubmenuLabels,
  model: MenuModel,
  history: HistorySubmenu,
): string {
  return JSON.stringify([dark, submenuLabels, model, history]);
}
