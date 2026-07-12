/**
 * Single source for per-case render-fidelity knowledge shared by the
 * visual-regression and labelary-sync harnesses: which cases can't match
 * pixel-for-pixel (encoder divergence), which have no usable reference,
 * and which carry a pinned, known bounds delta.
 */

// Encoder-divergent cases: bwip picks different codewords/stacking than
// Zebra firmware, so cell patterns can't match pixel-for-pixel (also true
// for gs1databar sym 1, re-checked 2026-07-04). Size and placement still
// must, so these run the ink-bounds comparison instead.
export const BOUNDS_ONLY_TESTS: ReadonlySet<string> = new Set([
  // Different DataMatrix codeword selection (~37 of 18x18 modules differ).
  "barcode_datamatrix_standard",
  // Different MicroPDF417 encoding (~511 px diff); same 38-module, 11-row layout.
  "barcode_micropdf417_standard",
  // GS1 DataBar stacking/finder-pattern differs from Zebra firmware.
  "barcode_gs1databar_standard",
  "barcode_gs1databar_truncated",
  "barcode_gs1databar_stacked",
  "barcode_gs1databar_stacked_omni",
  "barcode_gs1databar_limited",
  "barcode_gs1databar_expanded",
  // Encoder discrepancies persist through rotation.
  "barcode_datamatrix_rot_R",
  // PDF417 is pixel-exact for short content, but longer payloads expose
  // encoder freedom (text sub-mode switching, padding/ECC arrangement):
  // same columns and rows as Labelary, different inner codewords.
  "barcode_pdf417_auto_long60",
  "barcode_pdf417_auto_long90_sec2",
  "barcode_pdf417_auto_long120",
]);

// No usable reference at all: Labelary renders ^BB wrong (see README
// limitations; the fixture's 58x7 dots cannot hold a Code128-based row).
// Real-printer reference pending; bwip stays best-effort.
export const NO_REFERENCE_TESTS: ReadonlySet<string> = new Set([
  "barcode_codablock_standard",
]);

/** Known signed bounds deltas (local minus Labelary), pinned exactly so a
 *  bwip update that shifts the encoding breaks loudly instead of hiding
 *  inside a tolerance. */
export const EXPECTED_BOUNDS_DELTA: Record<string, { w?: number; h?: number }> = {
  // bwip packs all-numeric PDF417 into 15 rows where Zebra emits 16
  // (numeric compaction differs); one rowHeight = 10 dots shorter.
  barcode_pdf417_auto_long120: { h: -10 },
};
