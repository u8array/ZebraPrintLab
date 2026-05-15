import { describe, it, expect } from 'vitest';
import {
  EM_TOP_ABOVE_CAP,
  ZPL_FONT_HEIGHT_TO_CSS_RATIO,
  objectToDisplay,
  displayToObject,
} from './textPositionTransforms';

const ROT = ['N', 'R', 'I', 'B'] as const;

// Mirror the private RENDER_Y_BIAS constant from textPositionTransforms.
// Kept as a literal here (rather than re-exported) so a future tweak to
// the bias has to update both: cheap accidental regressions go red.
const BIAS = 0.08;

describe('text position transforms', () => {
  describe('objectToDisplay — FT (baseline anchor)', () => {
    it('shifts Y up by fontHeight (+ bias) under FT/N', () => {
      const r = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'N' }, 'FT');
      expect(r.x).toBeCloseTo(100);
      expect(r.y).toBeCloseTo(200 - 30 + 30 * BIAS);
    });

    it('shifts X right by fontHeight (- bias) under FT/R', () => {
      const r = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'R' }, 'FT');
      expect(r.x).toBeCloseTo(100 + 30 / ZPL_FONT_HEIGHT_TO_CSS_RATIO - 30 * BIAS);
      expect(r.y).toBeCloseTo(200);
    });

    it('shifts Y down by fontHeight (- bias) under FT/I', () => {
      const r = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'I' }, 'FT');
      expect(r.x).toBeCloseTo(100);
      expect(r.y).toBeCloseTo(200 + 30 / ZPL_FONT_HEIGHT_TO_CSS_RATIO - 30 * BIAS);
    });

    it('shifts X left by fontHeight (- bias) under FT/B', () => {
      const r = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'B' }, 'FT');
      expect(r.x).toBeCloseTo(100 - 30 / ZPL_FONT_HEIGHT_TO_CSS_RATIO + 30 * BIAS);
      expect(r.y).toBeCloseTo(200);
    });
  });

  describe('objectToDisplay — FO (cap-top anchor)', () => {
    it('FO/N shifts Y up by the EM-top-to-cap-top gap (+ bias)', () => {
      const r = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'N' }, 'FO');
      expect(r.x).toBeCloseTo(100);
      expect(r.y).toBeCloseTo(200 - 30 * EM_TOP_ABOVE_CAP + 30 * BIAS);
    });

    it('FO/R shifts X right by fontHeight + ascender padding (- bias)', () => {
      const r = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'R' }, 'FO');
      expect(r.x).toBeCloseTo(100 + 30 + 30 * EM_TOP_ABOVE_CAP - 30 * BIAS);
      expect(r.y).toBeCloseTo(200);
    });

    it('FO/I shifts X by inkWidth and Y by fontHeight + padding (- bias)', () => {
      const r = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'I' }, 'FO', 42);
      expect(r.x).toBeCloseTo(100 + 42);
      expect(r.y).toBeCloseTo(200 + 30 + 30 * EM_TOP_ABOVE_CAP - 30 * BIAS);
    });

    it('FO/B shifts X left by padding (- bias) and Y down by inkWidth', () => {
      const r = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'B' }, 'FO', 42);
      expect(r.x).toBeCloseTo(100 - 30 * EM_TOP_ABOVE_CAP + 30 * BIAS);
      expect(r.y).toBeCloseTo(200 + 42);
    });

    it('treats undefined positionType like FO', () => {
      const a = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'N' }, undefined);
      const b = objectToDisplay(100, 200, { fontHeight: 30, rotation: 'N' }, 'FO');
      expect(a).toEqual(b);
    });
  });

  describe('round-trip', () => {
    for (const rotation of ROT) {
      for (const positionType of ['FO', 'FT', undefined] as const) {
        it(`displayToObject ∘ objectToDisplay = id for ${rotation}/${positionType ?? 'undef'}`, () => {
          const props = { fontHeight: 42, rotation };
          const objX = 123;
          const objY = 456;
          const inkWidth = 87;
          const display = objectToDisplay(objX, objY, props, positionType, inkWidth);
          const back = displayToObject(display.x, display.y, props, positionType, inkWidth);
          expect(back.x).toBeCloseTo(objX);
          expect(back.y).toBeCloseTo(objY);
        });
      }
    }
  });
});
