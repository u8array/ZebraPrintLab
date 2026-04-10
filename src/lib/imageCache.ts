/**
 * In-memory cache of user-uploaded images, keyed by a stable ID.
 * Images are stored as data-URLs so they survive across renders
 * but NOT across page reloads (intentional — no persistence yet).
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

const cache = new Map<string, CachedImage>();

export function getImage(id: string): CachedImage | undefined {
  return cache.get(id);
}

export function getAllImages(): CachedImage[] {
  return [...cache.values()];
}

export function putImage(img: CachedImage): void {
  cache.set(img.id, img);
}

export function removeImage(id: string): void {
  cache.delete(id);
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
        cache.set(entry.id, entry);
        resolve(entry);
      };
      img.onerror = () => reject(new Error(`Failed to decode image: ${file.name}`));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}
