import { invoke } from '@tauri-apps/api/core';
import { isDesktopShell } from './platform';

/**
 * Platform seam for secrets (API keys). Desktop routes to the OS credential
 * store via Rust commands (Windows Credential Manager, macOS Keychain, Linux
 * Secret Service); the web build can only offer localStorage. Non-secret
 * settings don't belong here; they go through the regular persisted stores.
 */

const LS_PREFIX = 'zpl-cred-';

export async function getCredential(name: string): Promise<string | null> {
  if (isDesktopShell) {
    return await invoke<string | null>('credential_get', { name });
  }
  return localStorage.getItem(LS_PREFIX + name);
}

/** Single-flight hydrate of one credential; the strategy hooks carry the
 *  policy (what a stored/empty/failed read means). A failed read retries on
 *  the next call. */
export function makeCredentialHydrator(strategy: {
  credName: string;
  isLoaded: () => boolean;
  onStored: (value: string) => void;
  onEmpty: () => void;
  onError: () => void;
}): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return () => {
    if (strategy.isLoaded()) return Promise.resolve();
    inFlight ??= (async () => {
      try {
        const stored = await getCredential(strategy.credName);
        // A concurrent save may have set the value while we read; keep it.
        if (strategy.isLoaded()) return;
        if (stored) strategy.onStored(stored);
        else strategy.onEmpty();
      } catch {
        strategy.onError();
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}

/** Store a value verbatim (passwords: whitespace is significant). Throws
 *  (with the backend's message) when the OS store is unavailable, e.g. a
 *  Linux session without a Secret Service daemon. */
export async function setCredentialExact(name: string, value: string): Promise<void> {
  if (isDesktopShell) {
    await invoke('credential_set', { name, value });
    return;
  }
  localStorage.setItem(LS_PREFIX + name, value);
}

export async function deleteCredential(name: string): Promise<void> {
  if (isDesktopShell) {
    await invoke('credential_delete', { name });
    return;
  }
  localStorage.removeItem(LS_PREFIX + name);
}

/** API-key semantics: trim, and an empty/whitespace value deletes. */
export async function setCredential(name: string, value: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed) {
    await setCredentialExact(name, trimmed);
  } else {
    await deleteCredential(name);
  }
}
