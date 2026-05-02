import { useState, useEffect } from 'react';
import { subscribe } from '../lib/fontCache';

/** Returns a version counter that increments whenever the font cache changes. */
export function useFontCacheVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribe(() => setVersion(v => v + 1)), []);
  return version;
}
