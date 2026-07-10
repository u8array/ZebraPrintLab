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

/** Store a credential; an empty/whitespace value deletes it. Throws (with the
 *  backend's message) when the OS store is unavailable, e.g. a Linux session
 *  without a Secret Service daemon. */
export async function setCredential(name: string, value: string): Promise<void> {
  const trimmed = value.trim();
  if (isDesktopShell) {
    if (trimmed) {
      await invoke('credential_set', { name, value: trimmed });
    } else {
      await invoke('credential_delete', { name });
    }
    return;
  }
  if (trimmed) {
    localStorage.setItem(LS_PREFIX + name, trimmed);
  } else {
    localStorage.removeItem(LS_PREFIX + name);
  }
}
