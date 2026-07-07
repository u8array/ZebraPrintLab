import { isTauri } from "@tauri-apps/api/core";

/** Single seam for "are we the desktop shell": components and store gate on
 *  this instead of importing Tauri detection ad hoc. Constant per session. */
export const isDesktopShell = isTauri();
