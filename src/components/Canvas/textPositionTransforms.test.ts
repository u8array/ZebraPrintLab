import { describe, it, expect } from 'vitest';
import {
  EM_TOP_ABOVE_CAP,
  ZPL_FONT_HEIGHT_TO_CSS_RATIO,
  modelToZplAnchor,
  zplAnchorToModel,
} from './textPositionTransforms';

const ROT = ['N', 'R', 'I', 'B'] as const;
const BIAS = 0.08;

describe('text position transforms — model ↔ ZPL anchor', () => {
  describe('modelToZplAnchor — FT (baseline)', () => {
    it('shifts Y down by fontHeight - bias under FT/N', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: 30, rotation: 'N' }, 'FT');
      expect(r.x).toBeCloseTo(100);
      expect(r.y).toBeCloseTo(200 + 30 - 30 * BIAS);
    });

    it('shifts X left by fontHeight - bias under FT/R', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: 30, rotation: 'R' }, 'FT');
      expect(r.x).toBeCloseTo(100 - 30 / ZPL_FONT_HEIGHT_TO_CSS_RATIO + 30 * BIAS);
      expect(r.y).toBeCloseTo(200);
    });

    it('shifts Y up by fontHeight - bias under FT/I', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: 30, rotation: 'I' }, 'FT');
      expect(r.x).toBeCloseTo(100);
      expect(r.y).toBeCloseTo(200 - 30 / ZPL_FONT_HEIGHT_TO_CSS_RATIO + 30 * BIAS);
    });

    it('shifts X right by fontHeight - bias under FT/B', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: 30, rotation: 'B' }, 'FT');
      expect(r.x).toBeCloseTo(100 + 30 / ZPL_FONT_HEIGHT_TO_CSS_RATIO - 30 * BIAS);
      expect(r.y).toBeCloseTo(200);
    });
  });

  describe('modelToZplAnchor — FO (cap-top)', () => {
    it('FO/N shifts Y down by ascender padding - bias', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: 30, rotation: 'N' }, 'FO');
      expect(r.x).toBeCloseTo(100);
      expect(r.y).toBeCloseTo(200 + 30 * EM_TOP_ABOVE_CAP - 30 * BIAS);
    });

    it('FO/R shifts X left by padding - bias', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: 30, rotation: 'R' }, 'FO');
      expect(r.x).toBeCloseTo(100 - 30 * EM_TOP_ABOVE_CAP + 30 * BIAS);
      expect(r.y).toBeCloseTo(200);
    });

    it('treats undefined positionType like FO', () => {
      const a = modelToZplAnchor(100, 200, { fontHeight: 30, rotation: 'N' }, undefined);
      const b = modelToZplAnchor(100, 200, { fontHeight: 30, rotation: 'N' }, 'FO');
      expect(a).toEqual(b);
    });
  });

  describe('round-trip', () => {
    for (const rotation of ROT) {
      for (const positionType of ['FO', 'FT', undefined] as const) {
        it(`zplAnchorToModel ∘ modelToZplAnchor = id for ${rotation}/${positionType ?? 'undef'}`, () => {
          const props = { fontHeight: 42, rotation };
          const objX = 123;
          const objY = 456;
          const anchor = modelToZplAnchor(objX, objY, props, positionType);
          const back = zplAnchorToModel(anchor.x, anchor.y, props, positionType);
          expect(back.x).toBeCloseTo(objX);
          expect(back.y).toBeCloseTo(objY);
        });
      }
    }
  });
});
