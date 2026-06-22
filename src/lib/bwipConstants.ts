import type { ZplRotation } from "../registry/rotation";

export const QR_FO_Y_OFFSET_DOTS = 10;
export const QR_FT_MODULE_OFFSET = 3;

// Zebra always reserves text zone below EAN/UPC (8 and 12 dpmm: 13 dots).
export const EAN_TEXT_ZONE_DOTS = 13;

// EAN/UPC HRI (OCR-B) font + bar-gap per ^BY module width (dots), indexed
// mw-1. Zebra renders OCR-B at discrete magnifications, so the size caps
// (mw 3-7) then doubles at mw 8 rather than scaling continuously.
const OCRB_EAN_HRI_FONT_DOTS = [8, 18, 28, 28, 28, 28, 28, 56, 56, 56];
const OCRB_EAN_HRI_GAP_DOTS = [4, 4, 5, 5, 5, 5, 5, 7, 7, 7];
function clampMw10(mw: number): number {
  return Math.max(1, Math.min(10, Math.round(mw)));
}
export function ocrbEanHriFontDots(mw: number): number {
  return OCRB_EAN_HRI_FONT_DOTS[clampMw10(mw) - 1] ?? 28;
}
export function ocrbEanHriGapDots(mw: number): number {
  return OCRB_EAN_HRI_GAP_DOTS[clampMw10(mw) - 1] ?? 5;
}

// Default HRI font (Labelary's Font A); also the generic 1D fallback.
export const HRI_FONT_A = "'Vera Mono', 'Courier New', monospace";
const EAN_HRI_OCRB = "'OCRB', 'Vera Mono', monospace";

// Labelary renders small EAN/UPC HRI (mw 1-2) in Font A (Vera) and
// switches to OCR-B at mw 3+. Applies to the main HRI and ^BS alike.
export function eanUpcHriFontFamily(mw: number): string {
  return clampMw10(mw) <= 2 ? HRI_FONT_A : EAN_HRI_OCRB;
}

// LOGMARS HRI above bars; ~10 dots gap, wider than the standard 1D textGap.
export const LOGMARS_TEXT_ABOVE_GAP_DOTS = 10;

// HRI-above bar-to-text gap per ^BY module width (Labelary ~13 dots at BY2);
// the above gap grows with module width, unlike the tight below-gap.
const ABOVE_HRI_GAP_DOTS = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
export function aboveHriGapDots(mw: number): number {
  return ABOVE_HRI_GAP_DOTS[clampMw10(mw) - 1] ?? 12;
}

// ^BS supplement bbox text-zone: OCR-B ink cap-height + gap per ^BY module.
// The render bottom-aligns the taller em box, so this ink height bounds it.
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

// Supplement HRI gap above the bars, tighter than the main HRI below-gap;
// upcSuppTextZoneDots reuses it for the bbox reservation.
export function upcSuppAboveGapDots(moduleWidth: number): number {
  return upcSuppStep(moduleWidth).gap;
}

export function upcSuppTextZoneDots(moduleWidth: number): number {
  const s = upcSuppStep(moduleWidth);
  return s.font + s.gap;
}

// HRI em per ^BY module: Labelary ink is ~7 dots/module, Vera cap ~0.72 em.
export const VERA_MONO_HRI_EM_PER_MODULE = 9.7;

// Konva centers a single line in its em box, so the glyph cap-top sits this
// fraction of fontSize below the text y. Subtracted to keep the gap em-independent.
export const VERA_MONO_HRI_CAP_TOP_PAD = 0.14;

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

export interface BarSubRect {
  barTop: number;
  barLeft: number;
  barW: number;
  barH: number;
}

/** Place the firmware-reserved HRI text zone within the rotated barcode
 *  footprint; the upright "below the bars" zone travels around the rectangle as
 *  the symbol rotates. Unit-agnostic (px or dots). Single source for the render
 *  path (getDisplaySize) and the rotation bbox probe (groupRotation), no drift. */
export function barSubRect(
  rotation: ZplRotation,
  zoneAbove: boolean,
  textZone: number,
  width: number,
  height: number,
): BarSubRect {
  let barTop = 0;
  let barLeft = 0;
  let barW = width;
  let barH = height;
  if (textZone > 0) {
    if (!zoneAbove) {
      switch (rotation) {
        case "N": barH = height - textZone; break;
        case "R": barLeft = textZone; barW = width - textZone; break;
        case "I": barTop = textZone; barH = height - textZone; break;
        case "B": barW = width - textZone; break;
      }
    } else {
      switch (rotation) {
        case "N": barTop = textZone; barH = height - textZone; break;
        case "R": barW = width - textZone; break;
        case "I": barH = height - textZone; break;
        case "B": barLeft = textZone; barW = width - textZone; break;
      }
    }
  }
  return { barTop, barLeft, barW, barH };
}
