import { describe, it, expect } from 'vitest';
import { code49 } from './code49';
import type { Code49Props } from './code49';
import type { LabelObjectBase } from '../types/LabelObject';
/**
 * The four-layer height-clamp contract for ^B4 Code 49:
 *   - UI:        NumberInput min/max blocks invalid typing
 *   - normalize: moduleWidth change re-clamps height across fields
 *   - commit:    Konva transformer drag past bwip's range pins to limit
 *   - render:    bwipHelpers clamps as a last-line defense for JSON loads
 *
 * The UI layer is enforced by HTML form behavior and not unit-tested
 * here; the other three layers live in pure code and get coverage below.
 */

const baseObj = (
  overrides: Partial<Code49Props> = {},
): LabelObjectBase & { props: Code49Props } => ({
  id: 'test',
  type: 'code49',
  x: 0,
  y: 0,
  rotation: 0,
  props: {
    content: 'CODE49',
    height: 20,
    moduleWidth: 2,
    printInterpretation: true,
    mode: 'A',
    rotation: 'N',
    ...overrides,
  },
});

describe('code49 — normalizeChanges height clamp on moduleWidth change', () => {
  it('clamps height up when new moduleWidth pushes minimum above current h', () => {
    // mw 2 → range [16, 100], h=20 valid. Bump to mw=5 → range [40, 250].
    // h=20 falls below the new floor, must round up to 40.
    const obj = baseObj({ height: 20, moduleWidth: 2 });
    const result = code49.normalizeChanges?.(obj, { props: { moduleWidth: 5 } });
    expect((result?.props as Partial<Code49Props>).height).toBe(40);
  });

  it('clamps height down when new moduleWidth pushes maximum below current h', () => {
    // mw 8 → range [64, 400], h=300 valid. Drop to mw=2 → range [16, 100].
    // h=300 exceeds new ceiling, must round down to 100.
    const obj = baseObj({ height: 300, moduleWidth: 8 });
    const result = code49.normalizeChanges?.(obj, { props: { moduleWidth: 2 } });
    expect((result?.props as Partial<Code49Props>).height).toBe(100);
  });

  it('leaves height untouched when moduleWidth is not in the change set', () => {
    const obj = baseObj({ height: 20, moduleWidth: 2 });
    const changes = { props: { content: 'NEW' } };
    expect(code49.normalizeChanges?.(obj, changes)).toBe(changes);
  });

  it('skips clamping when incoming moduleWidth is not a positive number', () => {
    // Defends against JSON imports / undo with garbage in moduleWidth.
    // Render-edge guard handles the genuinely-broken case; normalize
    // shouldn't anchor the clamp range to nonsense input.
    const obj = baseObj({ height: 20, moduleWidth: 2 });
    const changes = { props: { moduleWidth: 0 } };
    expect(code49.normalizeChanges?.(obj, changes)).toBe(changes);
  });

  it('respects an incoming height that is already valid for the new moduleWidth', () => {
    const obj = baseObj({ height: 20, moduleWidth: 2 });
    const changes = { props: { moduleWidth: 4, height: 64 } };
    const result = code49.normalizeChanges?.(obj, changes);
    // 64 is at the floor for mw=4 (8*4), keep as-is.
    expect((result?.props as Partial<Code49Props>).height).toBe(64);
  });
});

describe('code49 — commitTransform height clamp on resize drag', () => {
  it('clamps height up when a drag pulls it below the bwip minimum', () => {
    const obj = baseObj({ height: 20, moduleWidth: 2 });
    // Mimic a resize that halves the height and keeps moduleWidth roughly
    // intact. esy = 0.4 → new height ≈ 8 (below mw=2 floor of 16).
    const result = code49.commitTransform?.(obj, {
      sx: 1, sy: 0.4,
      snap: (v) => v,
      nodeHeight: 0,
      anchor: null,
    });
    expect(result?.height).toBeGreaterThanOrEqual(16);
  });

  it('clamps height down when a drag pushes it above the bwip maximum', () => {
    const obj = baseObj({ height: 20, moduleWidth: 2 });
    // esy = 10 → new height ≈ 200 (above mw=2 ceiling of 100).
    const result = code49.commitTransform?.(obj, {
      sx: 1, sy: 10,
      snap: (v) => v,
      nodeHeight: 0,
      anchor: null,
    });
    expect(result?.height).toBeLessThanOrEqual(100);
  });
});
