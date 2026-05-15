/** Text-only visual regression cases. Compared against Labelary with our
 *  uploaded custom font (R:PRINTLAB.TTF) so both sides use the same
 *  glyph data — the residual diff is just anti-aliasing edge noise
 *  between Labelary's renderer and Skia/@napi-rs/canvas. */
export interface TextTestCase {
  /** Unique id; doubles as the PNG filename stem under tests/fixtures/
   *  labelary_text_images/. */
  id: string;
  /** ZPL font height in dots (the `h` param of ^A0/^A@). */
  fontHeight: number;
  /** Character data passed to `^FD`. Keep to printable ASCII; the
   *  fixture renderer doesn't apply ^CI. */
  text: string;
  /** ZPL rotation. Mostly N for the first batch; rotated cases will
   *  come once we trust the unrotated baseline. */
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
];
