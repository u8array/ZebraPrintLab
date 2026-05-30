import { useState } from 'react';

/** Copy-to-clipboard with a transient "copied" flag for button UI.
 *  `getPayload` is called at copy-time (not at hook-call-time) so
 *  live-generated content reflects the current state — needed for
 *  the Setup-Script live-clock mode where the emitted ^ST stamp
 *  must be "now at click", not "now at last render". */
export function useCopyToClipboard(getPayload: () => string, resetMs = 1500) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    const payload = getPayload();
    if (!payload) return;
    // `navigator.clipboard` is undefined in non-secure contexts
    // (plain HTTP, file://) and in some embedded WebViews. Bail
    // out instead of throwing — the copy button is non-essential.
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(payload).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), resetMs);
    }).catch(() => { /* swallow: user-cancel or permission-denied */ });
  };

  return { copy, copied };
}
