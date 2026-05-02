/**
 * Vitest global setup — stubs browser APIs that are unavailable in Node.js.
 * Runs once per worker before any module is evaluated, so top-level module
 * code in imageCache.ts, labelStore.ts etc. can initialise without crashing.
 */

// ── localStorage ──────────────────────────────────────────────────────────────
const _ls: Record<string, string | undefined> = {};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() { return Object.keys(_ls).length; },
    key(i: number): string | null { return Object.keys(_ls)[i] ?? null; },
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(_ls, key) ? (_ls[key] ?? null) : null;
    },
    setItem(key: string, value: string): void { _ls[key] = value; },
    removeItem(key: string): void { _ls[key] = undefined; },
    clear(): void { for (const k of Object.keys(_ls)) _ls[k] = undefined; },
  } as Storage,
});

// ── FileReader ────────────────────────────────────────────────────────────────

class FakeFileReader {
  result: string | null = null;
  onload: ((event: { target: FakeFileReader }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  readAsDataURL(): void {
    this.result = 'data:font/truetype;base64,AAAA';
    this.onload?.({ target: this });
  }
}

Object.defineProperty(globalThis, 'FileReader', {
  configurable: true,
  value: FakeFileReader,
});

// ── navigator ─────────────────────────────────────────────────────────────────
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { language: 'en-US' } as Partial<Navigator>,
});

// ── document (canvas stub – used by ^GFA parser path) ────────────────────────

/** Minimal ImageData stub for canvas operations in Node. */
class FakeImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

function createFakeCanvas() {
  let _width = 0;
  let _height = 0;
  let _imageData: FakeImageData | null = null;

  const ctx = {
    createImageData(w: number, h: number): FakeImageData {
      return new FakeImageData(w, h);
    },
    putImageData(data: FakeImageData): void {
      _imageData = data;
    },
    getImageData(_sx: number, _sy: number, w: number, h: number): FakeImageData {
      return _imageData ?? new FakeImageData(w, h);
    },
    fillRect(): void { /* noop */ },
    drawImage(): void { /* noop */ },
    set fillStyle(_v: string) { /* noop */ },
  };

  return {
    get width() { return _width; },
    set width(v: number) { _width = v; },
    get height() { return _height; },
    set height(v: number) { _height = v; },
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,AAAA',
  };
}

Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    createElement(tag: string): unknown {
      if (tag === 'canvas') return createFakeCanvas();
      return {};
    },
  } as Partial<Document>,
});
