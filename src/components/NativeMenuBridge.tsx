import { useT } from "../hooks/useT";
import { useLabelStore } from "../store/labelStore";
import { useHistoryEntries } from "../store/useHistoryEntries";
import { buildHistorySubmenu } from "../lib/historyFormat";
import { useNativeMenu, type MenuHandlers, type MenuIcons } from "../hooks/useNativeMenu";
import type { MenuModel, SubmenuLabels } from "../lib/menuModel";

/** Hosts the native-menu wiring so the timeline build (useHistoryEntries runs
 *  per undoable commit) only exists in the desktop tree; the web header keeps
 *  its lazy popover instead. */
export function NativeMenuBridge({ model, submenuLabels, handlers, icons }: {
  model: MenuModel;
  submenuLabels: SubmenuLabels;
  handlers: MenuHandlers;
  icons: MenuIcons;
}) {
  const t = useT();
  const setUserError = useLabelStore((s) => s.setUserError);
  const { entries, currentIndex, jumpTo, clear, canClear, locked } = useHistoryEntries();
  const history = buildHistorySubmenu(t, entries, currentIndex, locked, canClear);
  // Desktop has no header fallback, so a menu-init failure would otherwise
  // strand the app silently; surface it in the shared error banner.
  const onInitError = () => setUserError(t.app.menuInitError);
  useNativeMenu(model, submenuLabels, handlers, icons, history, jumpTo, clear, onInitError);
  return null;
}
