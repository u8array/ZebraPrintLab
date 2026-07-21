import type { RefObject } from 'react';
import { isDesktopShell } from './platform';
import { triggerDownload } from './triggerDownload';

/** Native file dialogs for the desktop shell (web keeps its hidden <input>s):
 *  native menu callbacks may lack the user activation input.click() needs, and
 *  OS dialogs return real paths. The dialog plugin scopes picked paths itself,
 *  and the dynamic imports keep both plugins out of the web bundle. */

export interface FileFilter {
  name: string;
  extensions: string[];
}

export const DESIGN_FILTER: FileFilter = { name: 'JSON', extensions: ['json'] };
export const CSV_FILTER: FileFilter = { name: 'CSV', extensions: ['csv'] };
export const ZPL_FILTER: FileFilter = { name: 'ZPL', extensions: ['zpl'] };
export const SQLITE_FILTER: FileFilter = { name: 'SQLite', extensions: ['sqlite', 'sqlite3', 'db', 'db3'] };
export const EXCEL_FILTER: FileFilter = { name: 'Excel', extensions: ['xlsx', 'xlsm', 'xls', 'ods'] };

/** Shown when a save/export write fails; domain-neutral so both the design save
 *  and the ZPL export surface the same message. */
export const saveErrorMessage = 'Could not save the file.';

export const basename = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** File-menu entry point shared by open/import: native dialog on desktop,
 *  hidden input on web. `pick` returns null on cancel; a read failure rejects
 *  and routes to onError. */
export function pickViaMenu<T>(
  inputRef: RefObject<HTMLInputElement | null>,
  pick: () => Promise<T | null>,
  onPicked: (value: T) => void,
  onError: () => void,
): void {
  if (!isDesktopShell) {
    inputRef.current?.click();
    return;
  }
  void (async () => {
    try {
      const value = await pick();
      if (value) onPicked(value);
    } catch {
      onError();
    }
  })();
}

/** Open a dialog and read the picked file via `read`. Null on cancel; a read
 *  failure rejects so callers can surface their own error state. */
async function pickFile<T>(
  filter: FileFilter,
  read: (path: string) => Promise<T>,
): Promise<{ name: string; value: T } | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({ multiple: false, directory: false, filters: [filter] });
  if (!path) return null;
  return { name: basename(path), value: await read(path) };
}

/** Pick a file and return only its path (desktop-only; consumers that hand
 *  the path to a Rust command instead of reading the bytes themselves). */
export async function pickFilePath(filter: FileFilter): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  return open({ multiple: false, directory: false, filters: [filter] });
}

export async function pickFileText(filter: FileFilter): Promise<{ name: string; text: string } | null> {
  const picked = await pickFile(filter, async (path) => {
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    return readTextFile(path);
  });
  return picked && { name: picked.name, text: picked.value };
}

/** Pick a file and read raw bytes (callers that decode themselves, e.g. the
 *  CSV import with its persisted encoding). */
export async function pickFileBytes(filter: FileFilter): Promise<{ name: string; bytes: Uint8Array } | null> {
  const picked = await pickFile(filter, async (path) => {
    const { readFile } = await import('@tauri-apps/plugin-fs');
    return readFile(path);
  });
  return picked && { name: picked.name, bytes: picked.value };
}

/** Save text: native save dialog on desktop, browser download on web. Returns
 *  true when a file was written, false when the user cancelled the dialog (so
 *  callers clear a stale error only on an actual write, not a cancel). */
export async function saveTextFile(
  text: string,
  opts: { filename: string; mimeType: string; filter: FileFilter },
): Promise<boolean> {
  if (!isDesktopShell) {
    triggerDownload(new Blob([text], { type: opts.mimeType }), opts.filename);
    return true;
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ defaultPath: opts.filename, filters: [opts.filter] });
  if (!path) return false;
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  await writeTextFile(path, text);
  return true;
}
