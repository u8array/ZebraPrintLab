/**
 * Font cache for printer TrueType fonts referenced by ^A@.
 * Fonts are stored as data-URLs and persisted to localStorage.
 * Each loaded font is registered with the browser's FontFace API
 * so Konva (canvas) can render text using it.
 */

import { hydrateLocalStoragePrefix, safeLocalStorageSet } from "./localStorageBucket";

export interface CachedFont {
  id: string;
  /** Original printer filename e.g. "ARIAL.TTF" (uppercased for lookup) */
  name: string;
  /** data-URL — data:font/truetype;base64,... */
  dataUrl: string;
  /** Registered CSS font-family name e.g. "zpl-ARIAL" */
  fontFamily: string;
}

const LS_PREFIX = 'zpl-font-';

/** Hard cap on a single font file. Browser MIME types for fonts are
 *  inconsistent (TTF often arrives as `application/octet-stream` or empty);
 *  we accept by extension and rely on this byte cap to bound damage. */
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
    // Font invalid or API unavailable — canvas will fall back to default font
  }
}

hydrateLocalStoragePrefix<CachedFont>(LS_PREFIX, (entry) => {
  cache.set(entry.name, entry);
  // Re-register asynchronously — canvas renders after React mounts.
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

/** Return the raw TTF/OTF bytes for a cached font, or undefined when
 *  the font is unknown. Decoded on demand from the persisted data URL
 *  so the cache stores only one representation. Used by the `~DY`
 *  emitter to ship the bytes inside the ZPL stream — both the printer
 *  and Labelary then resolve the font without a separate upload. */
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

/** Load raw TTF/OTF bytes into the cache. Mirrors `loadFontFile` but
 *  starts from a `Uint8Array` rather than a `File`, which is what the
 *  ZPL parser hands over after decoding a `~DY` payload. */
export async function loadFontBytes(
  bytes: Uint8Array,
  printerName: string,
): Promise<CachedFont> {
  const entry = registerBytes(bytes, printerName);
  await registerFontFace(entry);
  notify();
  return entry;
}

/** Synchronous counterpart of `loadFontBytes` used by the ZPL parser,
 *  which can't await per-token. Populates the cache immediately so
 *  subsequent measurement and emit calls see the font, and kicks off
 *  `FontFace.load()` in the background. The canvas re-renders on the
 *  next font-version tick once the FontFace resolves. */
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

/** Load a TTF/OTF File into the cache under the given printer font name.
 *  Rejects on non-TTF/OTF extension or oversized files. */
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
