/**
 * Vitest global setup — stubs browser APIs that are unavailable in Node.js.
 * Runs once per worker before any module is evaluated, so top-level module
 * code in imageCache.ts, labelStore.ts etc. can initialise without crashing.
 */

// ── localStorage ──────────────────────────────────────────────────────────────
const _ls: Record<string, string> = {};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() { return Object.keys(_ls).length; },
    key(i: number): string | null { return Object.keys(_ls)[i] ?? null; },
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(_ls, key) ? (_ls[key] ?? null) : null;
    },
    setItem(key: string, value: string): void { _ls[key] = value; },
    removeItem(key: string): void { delete _ls[key]; },
    clear(): void { for (const k of Object.keys(_ls)) delete _ls[k]; },
  } satisfies Storage,
});

// ── navigator ─────────────────────────────────────────────────────────────────
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { language: 'en-US' } as Partial<Navigator>,
});

// ── document (canvas stub only – used by ^GFA parser path) ───────────────────
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    createElement(tag: string): unknown {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => null,
          toDataURL: () => 'data:image/png;base64,',
        };
      }
      return {};
    },
  } as Partial<Document>,
});
