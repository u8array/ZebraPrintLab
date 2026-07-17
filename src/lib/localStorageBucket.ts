// Prefix-keyed localStorage helpers shared by image/font caches. Quota
// exhaustion and corrupt JSON are routine; hydration must never throw.
// Headless consumers (Node/MCP) have no localStorage: caches stay in-memory.

const hasLocalStorage = (): boolean => typeof localStorage !== "undefined";

/** Keys snapshotted before iteration so accept() mutations don't shift indexes. */
export function hydrateLocalStoragePrefix<T>(
  prefix: string,
  accept: (entry: T) => void,
): void {
  if (!hasLocalStorage()) return;
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

/** Caller's in-memory copy is authoritative; localStorage is reload-only. */
export function safeLocalStorageSet(key: string, value: string): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // quota full
  }
}

export function safeLocalStorageRemove(key: string): void {
  if (!hasLocalStorage()) return;
  localStorage.removeItem(key);
}
