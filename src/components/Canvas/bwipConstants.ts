export const QR_FO_Y_OFFSET_DOTS = 10;
export const QR_FT_MODULE_OFFSET = 3;

// Zebra/Labelary always reserves a mandatory text zone below EAN/UPC barcodes
// (even with printInterpretation=false). Verified at 8 and 12 dpmm: constant 13 dots.
export const EAN_TEXT_ZONE_DOTS = 13;

// ^BS UPC/EAN supplements print the digits ABOVE the bars (Zebra spec), with
// a larger reserved zone than the main EAN/UPC text band. Measured against
// Labelary for FO 50,50 ^BSN,80,Y: bbox top sits 18 dots above the FO anchor
// (bbox height 98 = bar height 80 + 18).
export const UPC_SUPP_TEXT_ZONE_DOTS = 18;

// LOGMARS renders the human-readable line ABOVE the bars (per spec).
// Empirically Labelary leaves ~10 dots between visible text bottom and bar top,
// wider than the standard textGap used for text below other 1D barcodes.
export const LOGMARS_TEXT_ABOVE_GAP_DOTS = 10;

// ^BS UPC/EAN supplement: text sits tight against the bars in Labelary,
// noticeably tighter than logmars and even slightly tighter than the
// standard 5-dot textGap. Empirically ~2 dots.
export const UPC_SUPP_TEXT_ABOVE_GAP_DOTS = 2;

// Total LOGMARS text-zone reserved by firmware (regardless of printInterpretation):
// glyph height + LOGMARS_TEXT_ABOVE_GAP_DOTS. Empirically 20 dots — used as part
// of the ZPL-correct bbox so selection-handles match the printed footprint.
export const LOGMARS_TEXT_ZONE_DOTS = 20;

// bwip-js adds 3 quiet-zone rows to MicroPDF417 canvas output.
export const MICROPDF417_QUIET_ZONE_ROWS = 3;

/**
 * bwip-vs-Zebra width-correction constants for symbologies whose bar
 * pattern in bwip-js diverges from Zebra firmware.
 *
 * code93 / code11: bwip uses a narrower quiet zone than Zebra. The delta
 *   is content-independent — it's the per-side quiet-zone shortfall in
 *   modules. Adding it to the bwip canvas module count yields the
 *   ZPL-correct print width. The bitmap stretches by ~10-25% to fill;
 *   bars look slightly wider than the print but dimensions match.
 *
 * plessey: bwip uses a fundamentally different bar encoding from Zebra
 *   ^BP — both grow linearly with content but at different rates. The
 *   ratio (≈0.6) is empirically derived from the canonical "12345678"
 *   fixture. The bitmap squeezes to ~60% width; bars look noticeably
 *   compressed but the printed footprint matches.
 */
export const CODE93_QUIET_ZONE_DELTA_MODULES = 17;
export const CODE11_QUIET_ZONE_DELTA_MODULES = 19;
// Expressed as a fraction so the canonical fixture (492 → 294 dots)
// matches exactly without rounding drift; numerically ≈ 0.5976.
export const PLESSEY_BWIP_TO_ZEBRA_WIDTH_RATIO = 49 / 82;

/** Symbologies whose displayed bbox is dimensionally ZPL-correct but whose
 *  bitmap diverges visually from Zebra firmware — either through stretching
 *  to fit the corrected bbox (code93/code11/plessey) or through a different
 *  bar-pattern encoder (gs1databar: bwip-js and Zebra encode the same data
 *  with the same module count but at different transition positions). UI
 *  surfaces a hint when one is selected so users know the layout is correct
 *  even when the visual rendering is approximate. */
export const BWIP_VISUAL_APPROX_TYPES = new Set<string>([
  "code93",
  "code11",
  "plessey",
  "gs1databar",
]);

// Per-symbology spec module heights for GS1 DataBar. bwip-js renders most
// non-stacked variants at the same canvas height as the omni form (33 modules)
// regardless of the actual variant, which doesn't match Zebra firmware. Use
// these spec values to compute the ZPL-correct bbox height instead of trusting
// the bwip canvas dims. Sym 7 (Expanded Stacked) is segments-dependent and
// falls back to the bwip-natural height.
//   1 Omnidirectional, 2 Truncated, 3 Stacked, 4 Stacked Omnidirectional,
//   5 Limited, 6 Expanded — modules from GS1 General Specifications.
export const GS1_DATABAR_SPEC_HEIGHT_MODULES: Partial<
  Record<1 | 2 | 3 | 4 | 5 | 6 | 7, number>
> = {
  1: 33,
  2: 13,
  3: 14,
  4: 72,
  5: 10,
  6: 34,
};

/** Rows of whitespace bwip adds top and bottom of the GS1 DataBar bar
 *  pattern when buildBwipOptions sets `paddingheight: N`. Re-used by
 *  the bitmap-crop logic so the bar-extraction stays in lockstep with
 *  the bwip option above. */
export const GS1_DATABAR_PADDING_ROWS = 2;

export const EAN_UPC_TYPES = new Set<string>([
  "ean13",
  "ean8",
  "upca",
  "upce",
]);
