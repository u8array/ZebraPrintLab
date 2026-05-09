import { describe, it, expect } from 'vitest';
import { objectToDisplay, displayToObject } from './textPositionTransforms';

const ROT = ['N', 'R', 'I', 'B'] as const;

describe('text position transforms', () => {
  describe('objectToDisplay', () => {
    it('shifts Y up by fontHeight under FT/N', () => {
      const r = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'N' }, 'FT');
      // FT N: dy = -fontHeight (-30); rotation offset for N is 0.
      expect(r).toEqual({ x: 100, y: 170 });
    });

    it('applies only the rotation offset under FO', () => {
      // FO + I → no FT correction, rotation offset dy = -15.
      const r = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'I' }, 'FO');
      expect(r).toEqual({ x: 100, y: 185 });
    });

    it('treats undefined positionType like FO', () => {
      const r = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'N' }, undefined);
      expect(r).toEqual({ x: 100, y: 200 });
    });

    it('combines FT correction and rotation offset for I', () => {
      // FT I: dy = renderedH (30/1.3 ≈ 23.077). Rotation offset I: dy -15.
      const r = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'I' }, 'FT');
      expect(r.x).toBeCloseTo(100);
      expect(r.y).toBeCloseTo(200 + 30 / 1.3 - 15);
    });
  });

  describe('round-trip', () => {
    for (const rotation of ROT) {
      for (const positionType of ['FO', 'FT', undefined] as const) {
        it(`displayToObject ∘ objectToDisplay = id for ${rotation}/${positionType ?? 'undef'}`, () => {
          const props = { fontHeight: 42, rotation };
          const objX = 123;
          const objY = 456;
          const display = objectToDisplay(objX, objY, props, positionType);
          const back = displayToObject(display.x, display.y, props, positionType);
          expect(back.x).toBeCloseTo(objX);
          expect(back.y).toBeCloseTo(objY);
        });
      }
    }
  });
});
