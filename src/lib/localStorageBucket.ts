/**
 * Prefix-keyed localStorage helpers shared by the image / font caches.
 *
 * Both caches persist data-URL-bearing entries so reloads survive, but they
 * must never crash the app: quota exhaustion and corrupt JSON are routine.
 * These helpers centralise the two failure modes (quota on write, corrupt
 * entries on hydration) so each cache module stays focused on its domain.
 */

/**
 * Iterate every localStorage entry whose key starts with `prefix`, parse it
 * as JSON, and forward the parsed value to `accept`. Corrupt entries are
 * silently dropped — runtime hydration must never throw.
 */
export function hydrateLocalStoragePrefix<T>(
  prefix: string,
  accept: (entry: T) => void,
): void {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      accept(JSON.parse(raw) as T);
    } catch {
      // ignore corrupt entries
    }
  }
}

/**
 * Best-effort `setItem` that swallows quota errors. Callers keep an
 * in-memory copy as the authoritative state; localStorage is only the
 * cross-reload survival mechanism.
 */
export function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage full — caller's in-memory copy stays authoritative
  }
}
