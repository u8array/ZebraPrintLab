/**
 * Font cache for printer TrueType fonts referenced by ^A@.
 * Fonts are stored as data-URLs and persisted to localStorage.
 * Each loaded font is registered with the browser's FontFace API
 * so Konva (canvas) can render text using it.
 */

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

// Hydrate from localStorage on module load
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (!key?.startsWith(LS_PREFIX)) continue;
  try {
    const entry = JSON.parse(localStorage.getItem(key) ?? 'null') as CachedFont;
    cache.set(entry.name, entry);
    // Re-register fonts asynchronously — canvas renders after React mounts
    void registerFontFace(entry);
  } catch {
    // ignore corrupt entries
  }
}

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

/** Load a TTF/OTF File into the cache under the given printer font name. */
export async function loadFontFile(file: File, printerName: string): Promise<CachedFont> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const name = printerName.toUpperCase().replace(/\s+/g, '_');
      const fontFamily = printerNameToFamily(name);
      const entry: CachedFont = { id: crypto.randomUUID(), name, dataUrl, fontFamily };
      cache.set(name, entry);
      try {
        localStorage.setItem(LS_PREFIX + name, JSON.stringify(entry));
      } catch {
        // localStorage full — font stays in memory only
      }
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
