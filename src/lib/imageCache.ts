/**
 * Image cache keyed by a stable ID.
 * Images are stored as data-URLs and persisted to localStorage
 * so they survive page reloads.
 */

export interface CachedImage {
  id: string;
  name: string;
  /** data-URL (image/png or image/jpeg etc.) */
  dataUrl: string;
  /** Natural pixel width */
  width: number;
  /** Natural pixel height */
  height: number;
}

const LS_PREFIX = 'zpl-img-';

const cache = new Map<string, CachedImage>();

// Hydrate from localStorage on module load
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (!key?.startsWith(LS_PREFIX)) continue;
  try {
    const entry = JSON.parse(localStorage.getItem(key) ?? 'null') as CachedImage;
    cache.set(entry.id, entry);
  } catch {
    // ignore corrupt entries
  }
}

export function getImage(id: string): CachedImage | undefined {
  return cache.get(id);
}

export function getAllImages(): CachedImage[] {
  return [...cache.values()];
}

export function putImage(img: CachedImage): void {
  cache.set(img.id, img);
  try {
    localStorage.setItem(LS_PREFIX + img.id, JSON.stringify(img));
  } catch {
    // localStorage full — image stays in memory only
  }
}

export function removeImage(id: string): void {
  cache.delete(id);
  localStorage.removeItem(LS_PREFIX + id);
}

/** Load a File into the cache. Returns the CachedImage entry. */
export function loadImageFile(file: File): Promise<CachedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const entry: CachedImage = {
          id: crypto.randomUUID(),
          name: file.name,
          dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
        putImage(entry);
        resolve(entry);
      };
      img.onerror = () => reject(new Error(`Failed to decode image: ${file.name}`));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}
