import { describe, it, expect } from 'vitest';
import {
  EM_TOP_ABOVE_CAP,
  ZPL_FONT_HEIGHT_TO_CSS_RATIO,
  modelToZplAnchor,
  zplAnchorToModel,
} from './textPositionTransforms';

const ROT = ['N', 'R', 'I', 'B'] as const;
const BIAS = 0.08;
const H = 30;
const W = 42;

describe('text position transforms — model ↔ ZPL anchor', () => {
  describe('modelToZplAnchor — FT (baseline)', () => {
    it('shifts Y down by fontHeight - bias under FT/N', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: H, rotation: 'N' }, 'FT');
      expect(r.x).toBeCloseTo(100);
      expect(r.y).toBeCloseTo(200 + H - H * BIAS);
    });

    it('shifts X left by fontHeight - bias under FT/R', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: H, rotation: 'R' }, 'FT');
      expect(r.x).toBeCloseTo(100 - H / ZPL_FONT_HEIGHT_TO_CSS_RATIO + H * BIAS);
      expect(r.y).toBeCloseTo(200);
    });

    it('shifts Y up by fontHeight - bias under FT/I', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: H, rotation: 'I' }, 'FT');
      expect(r.x).toBeCloseTo(100);
      expect(r.y).toBeCloseTo(200 - H / ZPL_FONT_HEIGHT_TO_CSS_RATIO + H * BIAS);
    });

    it('shifts X right by fontHeight - bias under FT/B', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: H, rotation: 'B' }, 'FT');
      expect(r.x).toBeCloseTo(100 + H / ZPL_FONT_HEIGHT_TO_CSS_RATIO - H * BIAS);
      expect(r.y).toBeCloseTo(200);
    });
  });

  describe('modelToZplAnchor — FO (cap-top)', () => {
    it('FO/N shifts Y down by ascender padding - bias', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: H, rotation: 'N' }, 'FO');
      expect(r.x).toBeCloseTo(100);
      expect(r.y).toBeCloseTo(200 + H * EM_TOP_ABOVE_CAP - H * BIAS);
    });

    // ^FO documents itself as the top-left of the character field regardless
    // of rotation. After Konva's rotation the pivot lands at a different
    // corner of the rotated bbox per rotation, so the shift must cover both
    // the EM-padding (pad - bias) AND the full h/w jump to the actual top-
    // left of the visible field.
    it('FO/R shifts X left by h + (padding - bias) (no inkWidth needed)', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: H, rotation: 'R' }, 'FO');
      expect(r.x).toBeCloseTo(
        100 - H / ZPL_FONT_HEIGHT_TO_CSS_RATIO - H * EM_TOP_ABOVE_CAP + H * BIAS,
      );
      expect(r.y).toBeCloseTo(200);
    });

    it('FO/I subtracts inkWidth on X and h + (pad - bias) on Y', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: H, rotation: 'I' }, 'FO', W);
      expect(r.x).toBeCloseTo(100 - W);
      expect(r.y).toBeCloseTo(
        200 - H / ZPL_FONT_HEIGHT_TO_CSS_RATIO - H * EM_TOP_ABOVE_CAP + H * BIAS,
      );
    });

    it('FO/B shifts X by (pad - bias) and Y up by inkWidth', () => {
      const r = modelToZplAnchor(100, 200, { fontHeight: H, rotation: 'B' }, 'FO', W);
      expect(r.x).toBeCloseTo(100 + H * EM_TOP_ABOVE_CAP - H * BIAS);
      expect(r.y).toBeCloseTo(200 - W);
    });

    it('treats undefined positionType like FO', () => {
      const a = modelToZplAnchor(100, 200, { fontHeight: H, rotation: 'N' }, undefined);
      const b = modelToZplAnchor(100, 200, { fontHeight: H, rotation: 'N' }, 'FO');
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
          const inkWidth = 87;
          const anchor = modelToZplAnchor(objX, objY, props, positionType, inkWidth);
          const back = zplAnchorToModel(anchor.x, anchor.y, props, positionType, inkWidth);
          expect(back.x).toBeCloseTo(objX);
          expect(back.y).toBeCloseTo(objY);
        });
      }
    }
  });
});
