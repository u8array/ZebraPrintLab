import { describe, it, expect } from 'vitest';
import { centeredSpawnAnchor, spawnRotationOverride } from './spawn';
import { objectBoundsDots } from './objectBounds';
import { getEntry } from '../registry';
import type { LabelObject } from '../types/Group';

const LABEL = { widthMm: 100, heightMm: 60, dpmm: 8 };

describe('spawnRotationOverride', () => {
  it('pre-rotates step-rotation types against the view rotation', () => {
    expect(spawnRotationOverride('text', undefined, 90)).toEqual({ rotation: 'B' });
    expect(spawnRotationOverride('qrcode', undefined, 180)).toEqual({ rotation: 'I' });
    expect(spawnRotationOverride('text', undefined, 270)).toEqual({ rotation: 'R' });
  });

  it('is a no-op in the unrotated view', () => {
    expect(spawnRotationOverride('text', undefined, 0)).toBeUndefined();
  });

  it('leaves types without a reading direction alone', () => {
    expect(spawnRotationOverride('box', undefined, 90)).toBeUndefined();
    expect(spawnRotationOverride('line', undefined, 90)).toBeUndefined();
    expect(spawnRotationOverride('image', undefined, 90)).toBeUndefined();
  });

  it('yields to an explicit rotation override', () => {
    expect(spawnRotationOverride('text', { rotation: 'R' }, 90)).toBeUndefined();
  });

  it('returns undefined for unknown types', () => {
    expect(spawnRotationOverride('nonexistent_type_xyz', undefined, 90)).toBeUndefined();
  });
});

describe('centeredSpawnAnchor', () => {
  it('offsets a box so its center lands on the point', () => {
    // box defaults are 200x100 with the anchor at the visual top-left.
    expect(centeredSpawnAnchor('box', undefined, { x: 400, y: 300 }, LABEL, 0)).toEqual({ x: 300, y: 250 });
  });

  it('keeps the visual center on the point for every view and rotation', () => {
    for (const view of [0, 90, 180, 270] as const) {
      for (const type of ['text', 'qrcode', 'code128'] as const) {
        const at = { x: 320, y: 240 };
        const a = centeredSpawnAnchor(type, undefined, at, LABEL, view);
        expect(a).not.toBeNull();
        // Rebuild the exact spawn the store creates and check its bbox center.
        const def = getEntry(type);
        const props = { ...def?.defaultProps, ...spawnRotationOverride(type, undefined, view) };
        const b = objectBoundsDots(
          { id: 't', type, x: a!.x, y: a!.y, rotation: 0, props } as LabelObject,
          { label: LABEL },
        );
        expect(Math.abs(b.x + b.width / 2 - at.x)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(b.y + b.height / 2 - at.y)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('returns null for unknown types', () => {
    expect(centeredSpawnAnchor('nonexistent_type_xyz', undefined, { x: 0, y: 0 }, LABEL, 0)).toBeNull();
  });
});
