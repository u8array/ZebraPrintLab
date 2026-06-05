export const QR_FO_Y_OFFSET_DOTS = 10;
export const QR_FT_MODULE_OFFSET = 3;

// Zebra always reserves text zone below EAN/UPC (8 and 12 dpmm: 13 dots).
export const EAN_TEXT_ZONE_DOTS = 13;

// LOGMARS HRI above bars; ~10 dots gap, wider than the standard 1D textGap.
export const LOGMARS_TEXT_ABOVE_GAP_DOTS = 10;

// ^BS supplement: Font 0 magnification steps (Labelary 8dpmm, ^BSN,80,Y).
const UPC_SUPP_SIZE_STEPS: { maxMw: number; font: number; gap: number }[] = [
  { maxMw: 1, font: 7, gap: 2 },
  { maxMw: 2, font: 14, gap: 4 },
  { maxMw: 7, font: 21, gap: 3 },
];
const UPC_SUPP_SIZE_FALLBACK = { font: 44, gap: 5 } as const;

function upcSuppStep(moduleWidth: number): { font: number; gap: number } {
  return (
    UPC_SUPP_SIZE_STEPS.find((s) => moduleWidth <= s.maxMw) ??
    UPC_SUPP_SIZE_FALLBACK
  );
}

export function upcSuppFontDots(moduleWidth: number): number {
  return upcSuppStep(moduleWidth).font;
}

export function upcSuppAboveGapDots(moduleWidth: number): number {
  return upcSuppStep(moduleWidth).gap;
}

export function upcSuppTextZoneDots(moduleWidth: number): number {
  const s = upcSuppStep(moduleWidth);
  return s.font + s.gap;
}

// Courier Bold cap height ~0.583em; baseline leaves ~22% below ink.
export const COURIER_BOLD_INK_TO_EM = 1 / 0.583;
export const COURIER_BOLD_EM_BOTTOM_PAD = 0.22;

// glyph + LOGMARS_TEXT_ABOVE_GAP_DOTS; firmware-reserved regardless of interpretation.
export const LOGMARS_TEXT_ZONE_DOTS = 20;

// bwip-js adds 3 quiet-zone rows to MicroPDF417 canvas output.
export const MICROPDF417_QUIET_ZONE_ROWS = 3;

// bwip-js renders MicroPDF417 at 2 internal px per data row, independent of `rowheight`.
export const MICROPDF417_PX_PER_ROW = 2;

// bwip vs Zebra width corrections: code93/code11 quiet-zone shortfall
// (per-side modules); plessey ratio derived from "12345678" fixture.
export const CODE93_QUIET_ZONE_DELTA_MODULES = 17;
export const CODE11_QUIET_ZONE_DELTA_MODULES = 19;
// Fraction so 492 -> 294 dots matches exactly (~0.5976).
export const PLESSEY_BWIP_TO_ZEBRA_WIDTH_RATIO = 49 / 82;

/** approx = bitmap visual diverges but bbox is spec-correct.
 *  unverified = bitmap diverges AND bbox not Labelary-cross-checkable. */
export type BwipApproxSeverity = "approx" | "unverified";

export const BWIP_APPROX_SEVERITY: ReadonlyMap<string, BwipApproxSeverity> = new Map([
  ["code93", "approx"],
  ["code11", "approx"],
  ["plessey", "approx"],
  ["gs1databar", "approx"],
  ["code49", "unverified"],
  ["codablock", "unverified"],
]);

// GS1 General Specifications module heights; bwip renders non-stacked
// variants at omni (33) regardless. Sym 7 segments-dependent (falls back).
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

/** bwip's paddingheight rows; shared with bitmap-crop logic. */
export const GS1_DATABAR_PADDING_ROWS = 2;

export const EAN_UPC_TYPES = new Set<string>([
  "ean13",
  "ean8",
  "upca",
  "upce",
]);
