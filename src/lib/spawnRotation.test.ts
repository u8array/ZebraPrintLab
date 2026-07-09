import { describe, it, expect } from 'vitest';
import { spawnRotationOverride } from './spawnRotation';

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
