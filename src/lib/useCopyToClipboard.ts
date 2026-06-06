import { useEffect, useRef, useState } from 'react';

/** Copy-to-clipboard with a transient "copied" flag for button UI.
 *  `getPayload` is called at copy-time (not at hook-call-time) so
 *  live-generated content reflects the current state; needed for the
 *  Setup-Script live-clock mode where the emitted ^ST stamp must be
 *  "now at click", not "now at last render". */
export function useCopyToClipboard(getPayload: () => string, resetMs = 1500) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = () => {
    const payload = getPayload();
    if (!payload) return;
    // navigator.clipboard is undefined in non-secure contexts
    // (plain HTTP, file://) and in some embedded WebViews.
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(payload).then(() => {
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setCopied(false);
      }, resetMs);
    }).catch(() => { /* swallow: user-cancel or permission-denied */ });
  };

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { copy, copied };
}
