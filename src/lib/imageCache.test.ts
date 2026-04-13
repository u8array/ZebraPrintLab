import { describe, it, expect, beforeEach } from 'vitest';
import { getImage, getAllImages, putImage, removeImage } from './imageCache';
import type { CachedImage } from './imageCache';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFakeImage(id: string): CachedImage {
  return {
    id,
    name: `${id}.png`,
    dataUrl: `data:image/png;base64,${id}`,
    width: 100,
    height: 100,
  };
}

describe('imageCache', () => {
  beforeEach(() => {
    // Clear any images left over from previous tests
    for (const img of getAllImages()) {
      removeImage(img.id);
    }
  });

  it('putImage stores and getImage retrieves an image', () => {
    const img = makeFakeImage('test-1');
    putImage(img);
    const retrieved = getImage('test-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('test-1');
    expect(retrieved!.name).toBe('test-1.png');
    expect(retrieved!.dataUrl).toContain('test-1');
  });

  it('getImage returns undefined for unknown IDs', () => {
    expect(getImage('nonexistent')).toBeUndefined();
  });

  it('getAllImages returns all stored images', () => {
    putImage(makeFakeImage('a'));
    putImage(makeFakeImage('b'));
    const all = getAllImages();
    expect(all).toHaveLength(2);
    const ids = all.map((i) => i.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('removeImage deletes from cache and localStorage', () => {
    putImage(makeFakeImage('del'));
    expect(getImage('del')).toBeDefined();
    removeImage('del');
    expect(getImage('del')).toBeUndefined();
    expect(localStorage.getItem('zpl-img-del')).toBeNull();
  });

  it('putImage persists to localStorage', () => {
    putImage(makeFakeImage('persist'));
    const stored = localStorage.getItem('zpl-img-persist');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.id).toBe('persist');
  });

  it('overwriting an image replaces the old one', () => {
    putImage(makeFakeImage('ow'));
    putImage({ ...makeFakeImage('ow'), name: 'overwrite.png', width: 50 });
    const img = getImage('ow')!;
    expect(img.name).toBe('overwrite.png');
    expect(img.width).toBe(50);
    expect(getAllImages()).toHaveLength(1);
  });
});
