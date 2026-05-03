import { describe, it, expect } from 'vitest';
import { inverseRotateDelta, isAxisSwapped, nextRotation } from './rotationGeometry';

describe('inverseRotateDelta', () => {
  it('is identity at 0°', () => {
    expect(inverseRotateDelta(10, 5, 0)).toEqual([10, 5]);
  });

  it('maps screen-right to label-down at 90° CW view', () => {
    // visual right (10, 0) under 90° CW view → label coord direction (0, -10)
    // (because clicking right visually corresponds to the original "up" position)
    expect(inverseRotateDelta(10, 0, 90)).toEqual([0, -10]);
  });

  it('maps screen-down to label-right at 90° CW view', () => {
    expect(inverseRotateDelta(0, 10, 90)).toEqual([10, 0]);
  });

  it('inverts both axes at 180°', () => {
    expect(inverseRotateDelta(7, 3, 180)).toEqual([-7, -3]);
  });

  it('reverses 90° at 270°', () => {
    // 270° = inverse of 90°: applying 90° then 270° should give identity
    const [x, y] = inverseRotateDelta(10, 5, 90);
    expect(inverseRotateDelta(x, y, 270)).toEqual([10, 5]);
  });

  it('round-trips through 360° via 90° steps', () => {
    let dx = 10, dy = 5;
    for (let i = 0; i < 4; i++) {
      [dx, dy] = inverseRotateDelta(dx, dy, 90);
    }
    expect([dx, dy]).toEqual([10, 5]);
  });
});

describe('isAxisSwapped', () => {
  it('returns false for 0° and 180°', () => {
    expect(isAxisSwapped(0)).toBe(false);
    expect(isAxisSwapped(180)).toBe(false);
  });

  it('returns true for 90° and 270°', () => {
    expect(isAxisSwapped(90)).toBe(true);
    expect(isAxisSwapped(270)).toBe(true);
  });
});

describe('nextRotation', () => {
  it('cycles 0 → 90 → 180 → 270 → 0', () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(90)).toBe(180);
    expect(nextRotation(180)).toBe(270);
    expect(nextRotation(270)).toBe(0);
  });
});
