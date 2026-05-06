import type { LabelObject } from "../../registry";
import { objectRotation } from "../../registry/rotation";
import { dotsToPx } from "../../lib/coordinates";
import { MICROPDF417_QUIET_ZONE_ROWS } from "./bwipConstants";

const BCID: Partial<Record<LabelObject["type"], string>> = {
  code128: "code128",
  code39: "code39",
  ean13: "ean13",
  ean8: "ean8",
  upca: "upca",
  upce: "upce",
  interleaved2of5: "interleaved2of5",
  code93: "code93",
  code11: "code11",
  industrial2of5: "industrial2of5",
  standard2of5: "iata2of5",   // ZPL ^BJ matches bwip IATA 2 of 5, not code2of5
  codabar: "rationalizedCodabar",
  logmars: "code39",
  msi: "msi",
  plessey: "plessey",
  gs1databar: "databaromni",
  planet: "planet",
  postal: "postnet",
  pdf417: "pdf417",
  qrcode: "qrcode",
  datamatrix: "datamatrix",
  aztec: "azteccodecompact",
  micropdf417: "micropdf417",
  codablock: "codablockf",
};

export const BWIP_SCALE = 2;
const BWIP_2D_INTERNAL_SCALE = 2;

/**
 * Estimate the number of columns ZPL/Labelary would choose for PDF417 when
 * columns=0 (auto). Zebra uses a heuristic to keep the symbol somewhat square.
 * This formula is derived empirically by measuring Labelary outputs for
 * various content lengths.
 */
function estimatePdf417Columns(content: string, securityLevel: number): number {
  // Rough estimate of codewords: each 2.3 characters ~ 1 codeword.
  // Security level adds (2^(securityLevel+1)) error correction codewords.
  const dataCodewords = Math.ceil((content.length || 1) / 2.3);
  const eccCodewords = Math.pow(2, securityLevel + 1);
  const totalCodewords = dataCodewords + eccCodewords;

  // Zebra heuristic: columns = floor(sqrt(totalCodewords / 4))
  // Empirically validated against Labelary at 8dpmm for secLevel 0 and 1,
  // content lengths 10–49 chars.
  return Math.max(1, Math.min(30, Math.floor(Math.sqrt(totalCodewords / 4))));
}

// bwip reduces PDF417 rowheight to this internal minimum when the requested
// row count exceeds what the data strictly requires.
const BWIP_PDF417_MIN_ROWHEIGHT = 3;

// EAN/UPC bar-pattern module layout (no quiet zones — bwip-js native canvas).
// All values are module offsets/widths from the left edge of the bar pattern.
//   ean13/upca: 3 start | 6×7 (42) | 5 centre | 6×7 (42) | 3 end = 95 modules
//   ean8:       3 start | 4×7 (28) | 5 centre | 4×7 (28) | 3 end = 67 modules
//   upce:       3 start | 6×7 (42)             | 6 end           = 51 modules
// UPC-A reuses the EAN-13 bar pattern but only 5 inner digits per side are
// visible (system digit floats outside-left, check digit outside-right).
const EAN_UPC_MODULE_OFFSETS = {
  ean13: { xLeft: 3, xRight: 50, halfWidth: 42 },
  ean8:  { xLeft: 3, xRight: 36, halfWidth: 28 },
  upca:  { xLeft: 10, xRight: 50, halfWidth: 35 },
  upce:  { xLeft: 3, xRight: 0,  halfWidth: 42 }, // single block, xRight unused
} as const;

export type EanUpcType = keyof typeof EAN_UPC_MODULE_OFFSETS;

export interface EanUpcLayout {
  /** Display pixels per encoded bwip module. */
  modulePx: number;
  /** x-position (display px) of the left/main digit block. */
  xLeft: number;
  /** x-position (display px) of the right digit block; 0 for upce. */
  xRight: number;
  /** Width (display px) of each digit block. */
  halfWidth: number;
}

/**
 * Compute display-pixel positions for the manually-rendered digit labels
 * underneath EAN/UPC bar patterns. Pure function; testable without Konva.
 */
export function getEanUpcLayout(
  type: EanUpcType,
  displayWidth: number,
  bwipCanvasWidth: number,
  bwipScale: number,
): EanUpcLayout {
  const modulePx = bwipScale * (displayWidth / bwipCanvasWidth);
  const o = EAN_UPC_MODULE_OFFSETS[type];
  return {
    modulePx,
    xLeft: o.xLeft * modulePx,
    xRight: o.xRight * modulePx,
    halfWidth: o.halfWidth * modulePx,
  };
}

// bwip-js renders postnet/planet bars at 4/3 the per-element width that Zebra
// firmware uses; this factor compresses the displayed canvas horizontally so
// the bounding box matches Labelary. Bars appear visually distorted as a result.
// The 0.0025 deviation from 0.75 (3/4) accounts for a small quiet-zone offset.
// Empirically derived from Labelary fixtures barcode_planet_standard (12 digits)
// and barcode_postal_standard (6 digits) at 8dpmm, moduleWidth=2.
const POSTNET_PLANET_WIDTH_RATIO = 0.7525;

/**
 * Compute the optimal bwip render scale for 1D barcodes so that each module
 * maps to an integer number of display pixels (avoiding anti-aliasing on
 * non-integer upscaling). Falls back to BWIP_SCALE when display pixels per
 * module round to zero.
 */
export function get1DBwipScale(
  moduleWidth: number,
  scale: number,
  dpmm: number,
): number {
  return Math.max(1, Math.round(dotsToPx(moduleWidth, scale, dpmm)));
}

export function eanCheckDigit(digits: string, w0: number, w1: number): string {
  let sum = 0;
  for (let i = 0; i < digits.length; i++)
    sum += parseInt(digits[i] ?? "0", 10) * (i % 2 === 0 ? w0 : w1);
  return String((10 - (sum % 10)) % 10);
}

/** Compute the UPC-E check digit from the 6 compressed data digits. */
export function upceCheckDigit(digits6: string): string {
  const [vA, vB, vC, vD, vE, vF] = digits6.padEnd(6, "0").split("");
  const fi = parseInt(vF ?? "0", 10);
  let exp: string;
  if (fi <= 2) exp = `0${vA}${vB}${vF}0000${vC}${vD}${vE}`;
  else if (fi === 3) exp = `0${vA}${vB}${vC}00000${vD}${vE}`;
  else if (fi === 4) exp = `0${vA}${vB}${vC}${vD}00000${vE}`;
  else exp = `0${vA}${vB}${vC}${vD}${vE}${vF}0000`;
  return eanCheckDigit(exp, 3, 1);
}

/**
 * Encode text as Code 128 subset B using bwip-js raw ^NNN format.
 * ZPL's ^BC defaults to subset B for printable ASCII content, so using raw
 * Code B here keeps the designer's module count in sync with Labelary.
 * Returns null for characters outside Code B range (ASCII 32–126).
 */
export function toCode128BRaw(text: string): string | null {
  if (!text) return null;
  const parts = ["^104"]; // Start B
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) return null;
    parts.push(`^${String(code - 32).padStart(3, "0")}`);
  }
  return parts.join("");
}

export function buildBwipOptions(
  obj: LabelObject,
  renderScale?: number,
  renderDpmm?: number,
): Record<string, unknown> | null {
  const bcid = BCID[obj.type];
  if (!bcid) return null;

  // For 1D barcodes, choose an integer-aligned scale so module widths map
  // exactly to display pixels (no fractional upscaling / anti-aliasing).
  const mw = (obj.props as { moduleWidth?: number }).moduleWidth ?? 2;
  const scale1D =
    renderScale != null && renderDpmm != null
      ? get1DBwipScale(mw, renderScale, renderDpmm)
      : BWIP_SCALE;

  // bwip-js takes the same N/R/I/B letters ZPL does for symbol orientation;
  // emitting it post-build means the produced bitmap is already rotated and
  // its dimensions are the post-rotation extents — no Konva-side rotation math
  // needed.
  const rotation = objectRotation(obj.props);

  let opts: Record<string, unknown> | null = null;

  switch (obj.type) {
    case "ean13":
    case "ean8":
    case "upca":
    case "upce": {
      const p = obj.props;
      let text: string;
      if (obj.type === "upce") {
        const r = p.content || "000000";
        text = r.length === 6 ? `0${r}` : r;
      } else {
        text = p.content || "0";
      }
      opts = { bcid, text, scale: scale1D, height: 10 };
      break;
    }
    case "code128": {
      const p = obj.props as { content?: string };
      const text = p.content || "0";
      // Note: ZPL ^BC e=Y (checkDigit) only prints the MOD-10 digit in the
      // interpretation line — it does NOT append it to the encoded barcode data.
      const rawB = toCode128BRaw(text);
      if (rawB) {
        opts = { bcid, text: rawB, raw: true, scale: scale1D, height: 10 };
      } else {
        opts = { bcid, text, scale: scale1D, height: 10 };
      }
      break;
    }
    case "code39":
    case "interleaved2of5":
    case "code93":
    case "code11":
    case "industrial2of5":
    case "standard2of5":
    case "codabar":
    case "plessey": {
      const p = obj.props;
      // Code39/Codabar/Plessey only encode uppercase letters. Zebra firmware
      // (and Labelary) silently uppercase lowercase input; bwip-js does not and
      // throws instead, which would crash the canvas for any imported ZPL with
      // lowercase content. Uppercase here so the lib matches firmware behaviour
      // without rewriting the user's source.
      const needsUpper = obj.type === "code39" || obj.type === "codabar" || obj.type === "plessey";
      const raw = p.content || "0";
      const text = needsUpper ? raw.toUpperCase() : raw;
      opts = { bcid, text, scale: scale1D, height: 10 };
      break;
    }
    case "msi": {
      const p = obj.props;
      // Zebra always encodes a Mod10 check digit in MSI regardless of the ^BM e=N
      // parameter (which only suppresses it in the interpretation line).
      opts = { bcid, text: p.content || "0", scale: scale1D, height: 10, includecheck: true };
      break;
    }
    case "postal": {
      const p = obj.props;
      opts = { bcid, text: p.content || "0", scale: scale1D, height: 10 };
      break;
    }
    case "logmars": {
      const p = obj.props;
      // LOGMARS is a Code39 subset; same uppercase rule applies.
      opts = {
        bcid,
        text: (p.content || "0").toUpperCase(),
        scale: scale1D,
        height: 10,
        includecheck: true,
      };
      break;
    }
    case "gs1databar": {
      const p = obj.props;
      const raw = (p.content || "0").replace(/\D/g, "");
      const padded = raw.padStart(13, "0").slice(0, 14);
      opts = {
        bcid,
        text: `(01)${padded}`,
        scale: scale1D,
        height: 10,
        // Adds 2 quiet-zone rows above and below so canvas height matches Labelary.
        paddingheight: 2,
      };
      break;
    }
    case "planet": {
      const p = obj.props;
      let raw = (p.content || "0").replace(/\D/g, "");
      if (raw.length < 11) raw = raw.padStart(11, "0");
      else if (raw.length === 12) raw = raw.padStart(13, "0");
      opts = {
        bcid,
        text: raw,
        scale: scale1D,
        height: 10,
        includecheck: true,
      };
      break;
    }
    case "pdf417": {
      const p = obj.props;
      const columns =
        p.columns || estimatePdf417Columns(p.content, p.securityLevel);
      opts = {
        bcid,
        text: p.content || " ",
        scale: BWIP_SCALE,
        rowheight: Math.max(
          1,
          Math.round(p.rowHeight / Math.max(p.moduleWidth, 1)),
        ),
        columns,
        // ZPL securityLevel 0 = auto → ECC level 0 (minimum). 1–8 map directly
        // to bwip eclevel 1–8 (empirically validated against Labelary).
        eclevel: String(p.securityLevel),
      };
      break;
    }
    case "qrcode": {
      const p = obj.props;
      opts = {
        bcid,
        text: p.content || " ",
        scale: BWIP_SCALE,
        eclevel: p.errorCorrection,
      };
      break;
    }
    case "datamatrix": {
      const p = obj.props;
      opts = { bcid, text: p.content || " ", scale: BWIP_SCALE };
      break;
    }
    case "aztec": {
      const p = obj.props;
      opts = { bcid, text: p.content || " ", scale: BWIP_SCALE };
      break;
    }
    case "micropdf417": {
      const p = obj.props;
      opts = {
        bcid,
        text: p.content || " ",
        scale: BWIP_SCALE,
        rowheight: Math.max(
          1,
          Math.round(p.rowHeight / Math.max(p.moduleWidth, 1)),
        ),
      };
      break;
    }
    case "codablock": {
      const p = obj.props;
      opts = {
        bcid,
        text: p.content || " ",
        scale: BWIP_SCALE,
        rowheight: Math.max(
          8,
          Math.round(p.rowHeight / Math.max(p.moduleWidth, 1)),
        ),
      };
      break;
    }
    default:
      return null;
  }

  if (opts && rotation !== "N") {
    // ZPL uses N/R/I/B (B = 270° CW). bwip-js uses N/R/I/L (L = 90° CCW =
    // 270° CW). The other three letters mean the same thing in both.
    opts.rotate = rotation === "B" ? "L" : rotation;
    // HRI text is handled as a Konva overlay in BarcodeObject (same as for
    // upright barcodes). Using bwip's includetext would embed text into the
    // bitmap at bwip's internal scale, making the bitmap taller/wider than the
    // bar-only dimensions that getDisplaySize computes — causing the KImage to
    // stretch the bitmap incorrectly and appear blurry/distorted.
  }
  return opts;
}

export function getDisplaySize(
  obj: LabelObject,
  canvas: HTMLCanvasElement,
  scale: number,
  dpmm: number,
): { w: number; h: number } {
  if (!canvas) return { w: 0, h: 0 };

  // For 90°/270° rotations, bwip-js produces a bitmap whose width and height
  // are swapped relative to the upright form. Compute size as if upright (the
  // existing per-symbology formulas all assume that), then swap at the end.
  const rotation = objectRotation(obj.props);
  const isQuarter = rotation === "R" || rotation === "B";
  const cw = isQuarter ? canvas.height : canvas.width;
  const ch = isQuarter ? canvas.width : canvas.height;
  const upright = getUprightDisplaySize(obj, cw, ch, scale, dpmm);
  return isQuarter ? { w: upright.h, h: upright.w } : upright;
}

function getUprightDisplaySize(
  obj: LabelObject,
  cw: number,
  ch: number,
  scale: number,
  dpmm: number,
): { w: number; h: number } {
  // bwip-js at bwipSc=1 renders 1 extra pixel; at bwipSc>=2 it renders the exact module
  // count. The extraPx term corrects for this so formulas stay consistent across scales.
  switch (obj.type) {
    case "code93":
    case "code11": {
      // bwip-js renders a narrower quiet zone than Zebra firmware.
      // Correcting to the Labelary width would stretch bars; return the bwip-natural size.
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const w = (cw / bwipSc) * modulePx;
      const h = dotsToPx(obj.props.height, scale, dpmm);
      return { w, h };
    }
    case "plessey": {
      // bwip-js uses a different bar encoding algorithm than Zebra firmware.
      // Width is approximate; the visual regression is skipped for this type.
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const w = (cw / bwipSc) * modulePx;
      const h = dotsToPx(obj.props.height, scale, dpmm);
      return { w, h };
    }
    case "planet":
    case "postal": {
      // See POSTNET_PLANET_WIDTH_RATIO comment. Rounding to dots ensures exact
      // match with Labelary fixtures regardless of bwip canvas pixel rounding.
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const rawPx = (cw / bwipSc) * modulePx * POSTNET_PLANET_WIDTH_RATIO;
      const wDots = Math.round((rawPx / scale) * dpmm);
      const w = dotsToPx(wDots, scale, dpmm);
      const h = dotsToPx(obj.props.height, scale, dpmm);
      return { w, h };
    }
    case "gs1databar": {
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const w = (cw / bwipSc) * modulePx;
      // Height is symbol-standard fixed (not the ZPL height param).
      // paddingheight:2 in buildBwipOptions adds the quiet-zone rows so
      // ch already reflects the correct total height.
      const h = (ch / bwipSc) * modulePx;
      return { w, h };
    }
    case "code128": {
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const w = (cw / bwipSc) * modulePx;
      const h = dotsToPx(obj.props.height, scale, dpmm);
      return { w, h };
    }
    case "ean13":
    case "ean8":
    case "upca":
    case "upce": {
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const extraPx = bwipSc === 1 ? 1 : 0;
      const w = ((cw - extraPx) / bwipSc) * modulePx;
      const h = dotsToPx(obj.props.height, scale, dpmm);
      return { w, h };
    }
    case "code39":
    case "logmars":
    case "interleaved2of5":
    case "industrial2of5":
    case "standard2of5":
    case "codabar":
    case "msi": {
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const extraPx = bwipSc === 1 ? 1 : 0;
      const w = ((cw - extraPx) / bwipSc) * modulePx;
      const h = dotsToPx(obj.props.height, scale, dpmm);
      return { w, h };
    }
    case "pdf417": {
      const p = obj.props;
      // bwip-js uses a fixed internal row height of 3 for pdf417
      const numRows = ch / (BWIP_PDF417_MIN_ROWHEIGHT * BWIP_SCALE);

      // Width check: bwip-js sometimes adds unexpected padding or uses
      // different column logic. We force the display width based on the
      // actual number of columns. PDF417 width in modules is:
      // 17 * start + 17 * left + 17 * columns + 17 * right + 18 * stop
      // Total = 17 * (columns + 4) + 1
      const columns =
        p.columns || estimatePdf417Columns(p.content, p.securityLevel);
      const modulesW = 17 * (columns + 4) + 1;

      const w = dotsToPx(modulesW * p.moduleWidth, scale, dpmm);
      const h = numRows * dotsToPx(p.rowHeight, scale, dpmm);
      return { w, h };
    }
    case "qrcode": {
      const modulePx = dotsToPx(obj.props.magnification, scale, dpmm);
      const size =
        (cw / (BWIP_SCALE * BWIP_2D_INTERNAL_SCALE)) * modulePx;
      return { w: size, h: size };
    }
    case "datamatrix": {
      const modulePx = dotsToPx(obj.props.dimension, scale, dpmm);
      const size =
        (cw / (BWIP_SCALE * BWIP_2D_INTERNAL_SCALE)) * modulePx;
      return { w: size, h: size };
    }
    case "aztec": {
      const modulePx = dotsToPx(obj.props.magnification, scale, dpmm);
      const size =
        (cw / (BWIP_SCALE * BWIP_2D_INTERNAL_SCALE)) * modulePx;
      return { w: size, h: size };
    }
    case "micropdf417": {
      const p = obj.props;
      // bwip-js ignores rowheight for micropdf417 and always uses 2 internal pixels per row.
      // It also adds MICROPDF417_QUIET_ZONE_ROWS quiet-zone rows (top+bottom) to the canvas.
      const numRows = Math.max(0, ch / (BWIP_SCALE * 2) - MICROPDF417_QUIET_ZONE_ROWS);
      const w =
        (cw / BWIP_SCALE) * dotsToPx(p.moduleWidth, scale, dpmm);
      const h = numRows * dotsToPx(p.rowHeight, scale, dpmm);
      return { w, h };
    }
    case "codablock": {
      const p = obj.props;
      const specRowheight = Math.max(
        8,
        Math.round(p.rowHeight / Math.max(p.moduleWidth, 1)),
      );
      const w =
        (cw / BWIP_SCALE) * dotsToPx(p.moduleWidth, scale, dpmm);
      const h =
        (ch / BWIP_SCALE) *
        (dotsToPx(p.rowHeight, scale, dpmm) / specRowheight);
      return { w, h };
    }
    default: {
      return { w: cw, h: ch };
    }
  }
}
