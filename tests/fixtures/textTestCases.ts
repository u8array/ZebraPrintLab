/** Text renderer-pair stability cases (NOT firmware fidelity — both
 *  sides load the same TTF, so this measures Skia-vs-Labelary
 *  rendering drift, not diff against printed Zebra output). See the
 *  test header in src/test/textVisualRegression.test.ts for the full
 *  framing. */
export interface TextTestCase {
  /** Unique id; doubles as the PNG filename stem under tests/fixtures/
   *  labelary_text_images/. */
  id: string;
  /** ZPL font height in dots (the `h` param of ^A0/^A@). */
  fontHeight: number;
  /** Character data passed to `^FD`. Keep to printable ASCII; the
   *  fixture renderer doesn't apply ^CI. */
  text: string;
  /** ZPL rotation. Today all N; rotated cases (R / I / B) are a
   *  follow-up — they exercise FO anchor math more than glyph
   *  rendering, which is where the next regression class would land. */
  rotation: 'N' | 'R' | 'I' | 'B';
  /** ^FO origin within the 4x4 inch (812×812 px @ 8 dpmm) canvas the
   *  fetch script renders. Pick a value that keeps the rendered bbox
   *  well inside the canvas at every test fontHeight + rotation. */
  x: number;
  y: number;
}

export const textTestCases: TextTestCase[] = [
  // Size sweep with numeric content (the most common label payload).
  { id: 'h20_n_num',     fontHeight: 20, text: '12345',        rotation: 'N', x: 200, y: 200 },
  { id: 'h30_n_num',     fontHeight: 30, text: '12345',        rotation: 'N', x: 200, y: 200 },
  { id: 'h50_n_num',     fontHeight: 50, text: '12345',        rotation: 'N', x: 200, y: 200 },
  { id: 'h80_n_num',     fontHeight: 80, text: '12345',        rotation: 'N', x: 200, y: 200 },

  // Alphabet caps — different glyph mix than digits.
  { id: 'h30_n_alpha',   fontHeight: 30, text: 'ABCDEF',       rotation: 'N', x: 200, y: 200 },
  { id: 'h80_n_alpha',   fontHeight: 80, text: 'ABCDEF',       rotation: 'N', x: 200, y: 200 },

  // Long numeric (barcode-payload-shaped) — width accumulates per-char
  // rounding error if any.
  { id: 'h39_n_long',    fontHeight: 39, text: '160940002422', rotation: 'N', x: 200, y: 200 },

  // Mixed content: digits + punctuation. Our font has special advance
  // widths for dot/hyphen, so this exercises the hmtx table.
  { id: 'h30_n_decimal', fontHeight: 30, text: '12.34',        rotation: 'N', x: 200, y: 200 },
  { id: 'h30_n_date',    fontHeight: 30, text: '2026-05-15',   rotation: 'N', x: 200, y: 200 },

  // Rotated cases at h50 + mixed alphanumeric, same anchor for visual
  // diff. Exercises FO anchor math, not glyph rendering.
  { id: 'h50_r_mix',     fontHeight: 50, text: 'AB123',        rotation: 'R', x: 200, y: 200 },
  { id: 'h50_i_mix',     fontHeight: 50, text: 'AB123',        rotation: 'I', x: 400, y: 400 },
  { id: 'h50_b_mix',     fontHeight: 50, text: 'AB123',        rotation: 'B', x: 400, y: 400 },
];
