/** Platform-aware keyboard shortcut display. Mac uses the ⌘/⇧ glyphs,
 *  every other platform uses the Ctrl+Shift+… convention. The actual
 *  shortcut handling already accepts metaKey or ctrlKey
 *  (see useGlobalShortcuts), so this module only affects the label. */

import { isMac } from './platform';

/** Render a keyboard shortcut for the current platform. */
export function kbd(key: string, opts: { shift?: boolean } = {}): string {
  if (isMac) {
    return `⌘${opts.shift ? '⇧' : ''}${key}`;
  }
  return `Ctrl+${opts.shift ? 'Shift+' : ''}${key}`;
}
