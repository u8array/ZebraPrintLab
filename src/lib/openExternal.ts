import { isDesktopShell } from './platform';

/** The project repository. Kept in sync with the opener capability allowlist in
 *  src-tauri/capabilities/default.json (opener:allow-open-url), which scopes the
 *  desktop opener to exactly this URL. */
export const REPO_URL = 'https://github.com/u8array/ZPLab';

/** The desktop webview sandboxes window.open, so external links route through
 *  the opener plugin (dynamic import keeps it out of the web bundle). */
export function openExternal(url: string): void {
  if (isDesktopShell) {
    void import('@tauri-apps/plugin-opener')
      .then(({ openUrl }) => openUrl(url))
      .catch(() => {
        // Denial likely means REPO_URL drifted from the opener allowlist in
        // capabilities/default.json.
        console.warn(`openExternal: could not open ${url}`);
      });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
