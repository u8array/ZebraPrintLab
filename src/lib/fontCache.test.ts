import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getFont, getFontFamily, getAllFonts, loadFontFile, removeFont, subscribe } from './fontCache';

function clearCache(): void {
  for (const font of getAllFonts()) {
    removeFont(font.name);
  }
}

function makeFakeFile(name: string): File {
  return new File(['fake-font-data'], name, { type: 'font/truetype' });
}

describe('fontCache', () => {
  beforeEach(() => {
    clearCache();
  });

  // ── getFont ──────────────────────────────────────────────────────────────────

  it('getFont returns undefined for unknown names', () => {
    expect(getFont('UNKNOWN.TTF')).toBeUndefined();
  });

  it('getFont lookup is case-insensitive', async () => {
    await loadFontFile(makeFakeFile('arial.ttf'), 'arial.ttf');
    expect(getFont('ARIAL.TTF')).toBeDefined();
    expect(getFont('arial.ttf')).toBeDefined();
    expect(getFont('Arial.TTF')).toBeDefined();
  });

  // ── loadFontFile ─────────────────────────────────────────────────────────────

  it('loadFontFile stores font and can be retrieved via getFont', async () => {
    const entry = await loadFontFile(makeFakeFile('arial.ttf'), 'ARIAL.TTF');
    expect(entry.name).toBe('ARIAL.TTF');
    expect(entry.dataUrl).toBe('data:font/truetype;base64,AAAA');
    expect(getFont('ARIAL.TTF')).toBe(entry);
  });

  it('loadFontFile uppercases the printer name', async () => {
    await loadFontFile(makeFakeFile('arial.ttf'), 'arial.ttf');
    expect(getFont('ARIAL.TTF')).toBeDefined();
  });

  it('loadFontFile derives fontFamily from printer name', async () => {
    const entry = await loadFontFile(makeFakeFile('arial.ttf'), 'ARIAL.TTF');
    expect(entry.fontFamily).toBe('zpl-ARIAL');
  });

  it('loadFontFile persists to localStorage', async () => {
    await loadFontFile(makeFakeFile('arial.ttf'), 'ARIAL.TTF');
    const stored = localStorage.getItem('zpl-font-ARIAL.TTF');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as { name: string };
    expect(parsed.name).toBe('ARIAL.TTF');
  });

  // ── getFontFamily ─────────────────────────────────────────────────────────────

  it('getFontFamily returns CSS family for a loaded font', async () => {
    await loadFontFile(makeFakeFile('helvetica.otf'), 'HELVETICA.OTF');
    expect(getFontFamily('HELVETICA.OTF')).toBe('zpl-HELVETICA');
  });

  it('getFontFamily returns undefined for unknown names', () => {
    expect(getFontFamily('MISSING.TTF')).toBeUndefined();
  });

  // ── getAllFonts ───────────────────────────────────────────────────────────────

  it('getAllFonts returns all loaded fonts', async () => {
    await loadFontFile(makeFakeFile('a.ttf'), 'A.TTF');
    await loadFontFile(makeFakeFile('b.ttf'), 'B.TTF');
    const names = getAllFonts().map((f) => f.name).sort();
    expect(names).toEqual(['A.TTF', 'B.TTF']);
  });

  it('getAllFonts returns empty array when nothing is loaded', () => {
    expect(getAllFonts()).toHaveLength(0);
  });

  // ── removeFont ────────────────────────────────────────────────────────────────

  it('removeFont deletes from cache and localStorage', async () => {
    await loadFontFile(makeFakeFile('arial.ttf'), 'ARIAL.TTF');
    expect(getFont('ARIAL.TTF')).toBeDefined();
    removeFont('ARIAL.TTF');
    expect(getFont('ARIAL.TTF')).toBeUndefined();
    expect(localStorage.getItem('zpl-font-ARIAL.TTF')).toBeNull();
  });

  it('removeFont on unknown name does not throw', () => {
    expect(() => removeFont('NONEXISTENT.TTF')).not.toThrow();
  });

  // ── subscribe ─────────────────────────────────────────────────────────────────

  it('subscribe is notified when a font is loaded', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    await loadFontFile(makeFakeFile('arial.ttf'), 'ARIAL.TTF');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('subscribe is notified when a font is removed', async () => {
    await loadFontFile(makeFakeFile('arial.ttf'), 'ARIAL.TTF');
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    removeFont('ARIAL.TTF');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('unsubscribe stops notifications', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    unsubscribe();
    await loadFontFile(makeFakeFile('arial.ttf'), 'ARIAL.TTF');
    expect(listener).not.toHaveBeenCalled();
  });
});
