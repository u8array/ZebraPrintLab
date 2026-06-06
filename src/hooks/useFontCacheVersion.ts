import { useState, useEffect } from 'react';
import { subscribe } from '../lib/fontCache';

/** Returns a version counter that increments whenever the font cache
 *  changes or the browser finishes loading additional @font-face fonts.
 *  Consumers (KonvaObject) re-render so any cached `measureText` they
 *  perform reflects the post-load glyph widths; without this the
 *  rendered position can drift between mounts when our PrintLab font
 *  finishes loading after first measure. */
export function useFontCacheVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const unsubCache = subscribe(bump);

    if (typeof document === 'undefined' || !('fonts' in document)) {
      return unsubCache;
    }

    const onLoadingDone = () => bump();
    document.fonts.addEventListener('loadingdone', onLoadingDone);
    // Cover fonts that were already loading when this mounted.
    void document.fonts.ready.then(bump);

    return () => {
      unsubCache();
      document.fonts.removeEventListener('loadingdone', onLoadingDone);
    };
  }, []);
  return version;
}
