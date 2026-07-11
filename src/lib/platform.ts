import { isTauri } from "@tauri-apps/api/core";

/** Single seam for "are we the desktop shell": components and store gate on
 *  this instead of importing Tauri detection ad hoc. Constant per session. */
export const isDesktopShell = isTauri();

/** Running on macOS/iOS: the app's single mac check (kbd glyphs, native menu).
 *  navigator.platform is deprecated, so fall back to the userAgent. */
export const isMac = ((): boolean => {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform ?? "";
  const ua = navigator.userAgent ?? "";
  return /Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS X/.test(ua);
})();

/** macOS desktop shell: the native menu needs AppKit conventions there (first
 *  submenu = application menu, clipboard shortcuts via Edit-menu selectors). */
export const isMacDesktop = isDesktopShell && isMac;
