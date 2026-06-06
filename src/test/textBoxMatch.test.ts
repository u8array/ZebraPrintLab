import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { PNG } from 'pngjs';
import { textBoxMatchCases } from '../../tests/fixtures/textBoxMatchCases';

/**
 * Box-match regression.
 *
 * Asserts that our local @napi-rs/canvas render (with PrintLab ZPL)
 * produces a glyph bounding box within a small tolerance of what
 * Labelary prints using the default Zebra firmware font (^A0,
 * CG Triumvirate). That's the comparison the user actually cares
 * about: "if my editor says this text fits, will it also fit on the
 * printed label?".
 *
 * We compare BBOX DIMENSIONS, not pixel content. The two fonts have
 * different glyph designs (Roboto vs. CG Triumvirate), so pixel-perfect
 * match is impossible; but the rendered footprint can and must
 * match for layout to be trustworthy.
 *
 * Test cases are `char × 3` patterns at multiple sizes (see
 * tests/fixtures/textBoxMatchCases.ts) covering digits, alpha caps,
 * alpha lowercase, and the punctuation chars Zebra renders unusually
 * wide. Fixture generation lives in
 * tests/scripts/fetch_labelary_default_text_fixtures.ts.
 */

const FIXTURES_DIR = path.resolve(
  process.cwd(),
  'tests/fixtures/labelary_text_default_images',
);
const FONT_PATH = path.resolve(
  process.cwd(),
  'src/assets/fonts/PrintLabZPL-Bold.ttf',
);

const CANVAS_PX = 812;
const FONT_FAMILY = 'PrintLab ZPL';

/** Per-axis tolerance in dots. Cap-bound and digit content lands at
 *  ≤3 dots once the font's per-glyph advance and vertical scaling are
 *  applied. The 6-dot allowance covers ascender / descender outliers
 *  where Roboto's inherent vertical proportions disagree with
 *  CG Triumvirate's by a few dots, visible only for `i` (dot above
 *  x-height), `p` (descender) and `.` (baseline edge). A real layout
 *  regression (wrong advance class, wrong fontSize) produces drift
 *  >12 dots even at small sizes, well above this ceiling. */
const BBOX_TOLERANCE_DOTS = 6;

interface BBox {
  width: number;
  height: number;
}

/** Scan a PNG for the smallest rectangle that contains all darkish
 *  pixels. Returns extent in pixels (= dots on our 8 dpmm canvas). */
function darkBBox(png: PNG): BBox {
  const { width, height, data } = png;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const lum =
        0.299 * (data[idx] ?? 0) +
        0.587 * (data[idx + 1] ?? 0) +
        0.114 * (data[idx + 2] ?? 0);
      if (lum < 200) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { width: 0, height: 0 };
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

describe('Text Box-Match — PrintLab ZPL vs. Labelary default font', () => {
  beforeAll(() => {
    if (!fs.existsSync(FONT_PATH)) {
      throw new Error(`Font file missing at ${FONT_PATH}`);
    }
    GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
  });

  it('has default-font fixtures (run fetch_labelary_default_text_fixtures.ts if this fails)', () => {
    expect(textBoxMatchCases.length).toBeGreaterThan(0);
    for (const tc of textBoxMatchCases) {
      const fixture = path.join(FIXTURES_DIR, `${tc.id}.png`);
      expect(fs.existsSync(fixture), `Missing fixture ${tc.id}.png`).toBe(true);
    }
  });

  describe.each(textBoxMatchCases)('Box: $id', (tc) => {
    it(`bbox matches Labelary default within ±${BBOX_TOLERANCE_DOTS} dots`, () => {
      // Render our font locally exactly as production does.
      const canvas = createCanvas(CANVAS_PX, CANVAS_PX);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
      ctx.fillStyle = 'black';
      ctx.font = `bold ${tc.fontHeight}px "${FONT_FAMILY}"`;
      ctx.textBaseline = 'top';
      // Mirror Konva's scaleX: ZPL `^A0,h,w` with w != h stretches each
      // glyph horizontally; w = 0 is the Zebra shorthand for "match h".
      const scaleX = tc.fontWidth > 0 ? tc.fontWidth / tc.fontHeight : 1;
      ctx.save();
      ctx.translate(tc.x, tc.y);
      ctx.scale(scaleX, 1);
      ctx.fillText(tc.text, 0, 0);
      ctx.restore();

      const localPng = PNG.sync.read(canvas.toBuffer('image/png'));
      const labelaryPng = PNG.sync.read(
        fs.readFileSync(path.join(FIXTURES_DIR, `${tc.id}.png`)),
      );

      const localBox = darkBBox(localPng);
      const labelaryBox = darkBBox(labelaryPng);

      expect(localBox.width, `width drift for ${tc.id}`).toBeGreaterThanOrEqual(
        labelaryBox.width - BBOX_TOLERANCE_DOTS,
      );
      expect(localBox.width).toBeLessThanOrEqual(
        labelaryBox.width + BBOX_TOLERANCE_DOTS,
      );
      expect(localBox.height, `height drift for ${tc.id}`).toBeGreaterThanOrEqual(
        labelaryBox.height - BBOX_TOLERANCE_DOTS,
      );
      expect(localBox.height).toBeLessThanOrEqual(
        labelaryBox.height + BBOX_TOLERANCE_DOTS,
      );
    });
  });
});
