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
 * as JSON, and forward the parsed value to `accept`. Corrupt entries and
 * non-object primitives (numbers, booleans, null, arrays) are silently
 * dropped — runtime hydration must never throw, and `T` is contractually
 * an object shape.
 *
 * Keys are snapshotted before iteration so an `accept` callback that
 * removes or adds localStorage entries can't shift indexes mid-loop.
 */
export function hydrateLocalStoragePrefix<T>(
  prefix: string,
  accept: (entry: T) => void,
): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      const entry: unknown = JSON.parse(raw);
      if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
        accept(entry as T);
      }
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
