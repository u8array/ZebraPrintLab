// ^A@ printer TTF cache; data-URL + FontFace registration + localStorage persistence.

import { hydrateLocalStoragePrefix, safeLocalStorageSet } from "./localStorageBucket";

export interface CachedFont {
  id: string;
  /** Uppercase printer filename. */
  name: string;
  /** data:font/truetype;base64,... */
  dataUrl: string;
  /** CSS font-family, e.g. "zpl-ARIAL". */
  fontFamily: string;
}

const LS_PREFIX = 'zpl-font-';

/** Hard cap; TTF MIME varies, so we accept by extension and cap bytes. */
export const MAX_FONT_BYTES = 4 * 1024 * 1024;

const FONT_EXT_RE = /\.(ttf|otf)$/i;

const cache = new Map<string, CachedFont>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(fn => fn());
}

/** Subscribe to cache changes. Returns an unsubscribe function. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function printerNameToFamily(name: string): string {
  // Strip extension, prefix with "zpl-" to avoid collisions with system fonts
  return 'zpl-' + name.replace(/\.[^.]+$/, '').toUpperCase();
}

async function registerFontFace(entry: CachedFont): Promise<void> {
  try {
    const face = new FontFace(entry.fontFamily, `url(${entry.dataUrl})`);
    await face.load();
    document.fonts.add(face);
  } catch {
    // Font invalid or API unavailable; canvas will fall back to default font
  }
}

hydrateLocalStoragePrefix<CachedFont>(LS_PREFIX, (entry) => {
  cache.set(entry.name, entry);
  // Re-register asynchronously; canvas renders after React mounts.
  void registerFontFace(entry);
});

/** Look up a cached font by printer filename (case-insensitive). */
export function getFont(printerName: string): CachedFont | undefined {
  return cache.get(printerName.toUpperCase());
}

/** Return the CSS font-family for a printer font name, or undefined if not loaded. */
export function getFontFamily(printerName: string): string | undefined {
  return cache.get(printerName.toUpperCase())?.fontFamily;
}

export function getAllFonts(): CachedFont[] {
  return [...cache.values()];
}

/** Decoded on demand from the persisted data URL. */
export function getFontBytes(printerName: string): Uint8Array | undefined {
  const entry = cache.get(printerName.toUpperCase());
  if (!entry) return undefined;
  const commaIdx = entry.dataUrl.indexOf(",");
  if (commaIdx < 0) return undefined;
  const base64 = entry.dataUrl.slice(commaIdx + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Uint8Array variant; parser hands these over after decoding ~DY. */
export async function loadFontBytes(
  bytes: Uint8Array,
  printerName: string,
): Promise<CachedFont> {
  const entry = registerBytes(bytes, printerName);
  await registerFontFace(entry);
  notify();
  return entry;
}

/** Sync; parser can't await per-token. FontFace.load runs in background. */
export function loadFontBytesSync(
  bytes: Uint8Array,
  printerName: string,
): CachedFont {
  const entry = registerBytes(bytes, printerName);
  void registerFontFace(entry).then(notify);
  notify();
  return entry;
}

function registerBytes(bytes: Uint8Array, printerName: string): CachedFont {
  if (bytes.length > MAX_FONT_BYTES) {
    throw new Error(
      `Font too large: ${printerName} (${bytes.length} bytes, max ${MAX_FONT_BYTES})`,
    );
  }
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const dataUrl = `data:font/truetype;base64,${btoa(binary)}`;
  const name = printerName.toUpperCase().replace(/[^A-Z0-9._]/g, "_");
  const fontFamily = printerNameToFamily(name);
  const entry: CachedFont = {
    id: crypto.randomUUID(),
    name,
    dataUrl,
    fontFamily,
  };
  cache.set(name, entry);
  safeLocalStorageSet(LS_PREFIX + name, JSON.stringify(entry));
  return entry;
}

export async function loadFontFile(file: File, printerName: string): Promise<CachedFont> {
  if (!FONT_EXT_RE.test(file.name)) {
    throw new Error(`Not a TTF/OTF font: ${file.name}`);
  }
  if (file.size > MAX_FONT_BYTES) {
    throw new Error(`Font too large: ${file.name} (${file.size} bytes, max ${MAX_FONT_BYTES})`);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const name = printerName.toUpperCase().replace(/[^A-Z0-9._]/g, '_');
      const fontFamily = printerNameToFamily(name);
      const entry: CachedFont = { id: crypto.randomUUID(), name, dataUrl, fontFamily };
      cache.set(name, entry);
      safeLocalStorageSet(LS_PREFIX + name, JSON.stringify(entry));
      await registerFontFace(entry);
      notify();
      resolve(entry);
    };
    reader.onerror = () => reject(new Error(`Failed to read font: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function removeFont(printerName: string): void {
  const name = printerName.toUpperCase();
  cache.delete(name);
  localStorage.removeItem(LS_PREFIX + name);
  notify();
}
