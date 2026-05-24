/**
 * ZPL-FIRST SIZING POLICY
 *
 * The designer is a layout tool, not a scanner. `getDisplaySize` maps the
 * bwip-js intrinsic canvas size to the ZPL-correct display pixels so the
 * displayed bbox matches what Zebra firmware will print. Bar patterns may
 * look slightly distorted because bwip-js' rendering algorithm differs.
 *
 * Per-symbology rationale (especially for the deliberately-not-corrected
 * cases code93, code11, plessey) is in the inline comments at each `case`
 * block in getUprightDisplaySize. The static-parse test in
 * bwipHelpers.test.ts ensures every BCID-registered type has a case.
 */

import { ObjectRegistry, type LeafObject } from "../../registry";
import type { LabelObject } from "../../types/Group";
import type { Gs1DatabarProps } from "../../registry/gs1databar";
import { objectRotation } from "../../registry/rotation";
import { dotsToPx } from "../../lib/coordinates";
import {
  GS1_DATABAR_DEFAULT_SEGMENTS,
  GS1_DATABAR_EXPANDED_SYMBOLOGIES,
  gtin14WithCheck,
  wrapGs1AIs,
} from "../../lib/gs1";
import {
  CODE11_QUIET_ZONE_DELTA_MODULES,
  CODE93_QUIET_ZONE_DELTA_MODULES,
  EAN_TEXT_ZONE_DOTS,
  GS1_DATABAR_PADDING_ROWS,
  GS1_DATABAR_SPEC_HEIGHT_MODULES,
  LOGMARS_TEXT_ZONE_DOTS,
  MICROPDF417_QUIET_ZONE_ROWS,
  PLESSEY_BWIP_TO_ZEBRA_WIDTH_RATIO,
  UPC_SUPP_TEXT_ZONE_DOTS,
} from "./bwipConstants";

/**
 * AI 01 followed by exactly 11 numeric digits (13 chars total) is not a valid
 * GTIN-14 element string. Zebra firmware does NOT pad it to Method 1; it falls
 * back to General Compaction (~149 modules at 8dpmm). bwip-js with `(01)<padded>`
 * would force Method 1 (~133 modules), so we re-route through `(99)` to get
 * General Compaction encoding too. Empirical cutoff (probed against Labelary).
 */
function isAi01ElevenDigitFragment(content: string): boolean {
  return /^01\d{11}$/.test(content);
}

/**
 * Bwip-js text for GS1 DataBar Expanded — wraps raw AI input in parens and
 * routes the empirically-known length-mismatch case (AI 01 + 11 digits) through
 * `(99)` so the rendered bitmap width matches Zebra firmware's print output.
 */
function gs1ExpandedBwipText(content: string): string {
  if (isAi01ElevenDigitFragment(content)) return `(99)${content}`;
  return wrapGs1AIs(content);
}

const GS1_DATABAR_BCID: Record<Gs1DatabarProps["symbology"], string> = {
  1: "databaromni",
  2: "databartruncated",
  3: "databarstacked",
  4: "databarstackedomni",
  5: "databarlimited",
  6: "databarexpanded",
  7: "databarexpandedstacked",
};

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
  // Placeholder — the actual bcid is resolved per-symbology via
  // GS1_DATABAR_BCID below. This entry exists only to pass the
  // `if (!bcid) return null` guard at the top of buildBwipOptions.
  gs1databar: "databaromni",
  planet: "planet",
  postal: "postnet",
  pdf417: "pdf417",
  qrcode: "qrcode",
  datamatrix: "datamatrix",
  aztec: "azteccodecompact",
  micropdf417: "micropdf417",
  codablock: "codablockf",
  // Placeholder — actual bcid (ean2 vs ean5) is resolved from the
  // content length in the per-type switch in buildBwipOptions.
  upcEanExtension: "ean5",
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

/**
 * Render-scale for 1D barcodes: integer-aligned per-module scale when the
 * caller supplies the canvas scale + dpmm, otherwise the BWIP_SCALE default.
 * Wrapping the branch lets per-type cases pass their own (narrowed,
 * required-typed) `moduleWidth` instead of going through a cast at the
 * generic top of buildBwipOptions.
 */
function bwipScale1D(
  moduleWidth: number,
  renderScale: number | undefined,
  renderDpmm: number | undefined,
): number {
  return renderScale != null && renderDpmm != null
    ? get1DBwipScale(moduleWidth, renderScale, renderDpmm)
    : BWIP_SCALE;
}

// Check-digit math now lives in src/lib/barcodeCheckDigits.ts (pure,
// no Canvas deps). Re-export here so existing callers (BarcodeObject)
// keep working without touching every import.
export { eanCheckDigit, upceCheckDigit } from "../../lib/barcodeCheckDigits";

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

/**
 * Translate ZPL ^BC field-data escape sequences (`>X`) into bwip-js parsefnc
 * syntax. Returns null when no recognized escape is present so the caller can
 * stay on the existing raw-Subset-B path.
 *
 * ZPL Code 128 escapes (Zebra ZPL II Programming Guide):
 *   >0 → literal `>`
 *   >5 → FNC1
 *   >6 → FNC2
 *   >7 → FNC3
 *   >8 → FNC4
 *   >9 → invoke Code C; inserts FNC1 only when it is the first character
 *        of the field (per ZPL II manual). Mid-string `>9` is just a
 *        subset switch which bwip auto-mode handles for digit runs.
 *   >: → switch to Subset B (dropped; bwip auto-mode chooses the subset)
 *   >; → switch to Subset A (dropped; bwip auto-mode chooses the subset)
 *
 * Without this translation, `STRSTR>52316094000242201` is rendered as 21 raw
 * Subset-B symbols, while the firmware reads `>5` as FNC1 and switches to
 * Subset C for the 16 trailing digits — yielding ~15 symbols and a much
 * narrower bbox. The mismatch is what users observe as "Länge stimmt nicht".
 */
export function parseZplCode128Escapes(text: string): string | null {
  if (!/>[05-9:;]/.test(text)) return null;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // bwip parsefnc treats `^` as escape char; double it for a literal `^`.
    if (ch === "^") { out += "^^"; continue; }
    if (ch === ">" && i + 1 < text.length) {
      const next = text[i + 1];
      switch (next) {
        case "0": out += ">"; i++; continue;
        case "5": out += "^FNC1"; i++; continue;
        case "6": out += "^FNC2"; i++; continue;
        case "7": out += "^FNC3"; i++; continue;
        case "8": out += "^FNC4"; i++; continue;
        case "9": if (i === 0) out += "^FNC1"; i++; continue;
        case ":":
        case ";": i++; continue; // subset switch — bwip auto-mode handles it
      }
    }
    out += ch;
  }
  return out;
}

export function buildBwipOptions(
  obj: LeafObject,
  renderScale?: number,
  renderDpmm?: number,
): Record<string, unknown> | null {
  const bcid = BCID[obj.type];
  if (!bcid) return null;

  // bwip-js takes the same N/R/I/B letters ZPL does for symbol orientation;
  // emitting it post-build means the produced bitmap is already rotated and
  // its dimensions are the post-rotation extents — no Konva-side rotation math
  // needed.
  const rotation = objectRotation(obj.props);

  // Declared without an initializer because every reachable case
  // assigns before `break` and the `default` arm returns early — the
  // previous `= null` initializer is what ESLint 10's
  // no-useless-assignment now flags as dead.
  let opts: Record<string, unknown>;

  switch (obj.type) {
    case "ean13":
    case "ean8":
    case "upca":
    case "upce": {
      const p = obj.props;
      const scale = bwipScale1D(p.moduleWidth, renderScale, renderDpmm);
      let text: string;
      if (obj.type === "upce") {
        const r = p.content || "000000";
        text = r.length === 6 ? `0${r}` : r;
      } else {
        text = p.content || "0";
      }
      opts = { bcid, text, scale, height: 10 };
      break;
    }
    case "upcEanExtension": {
      const p = obj.props;
      const scale = bwipScale1D(p.moduleWidth, renderScale, renderDpmm);
      // ZPL ^BS uses one command for both lengths; bwip splits the
      // bcid. Anything that isn't a 2-digit supplement is rendered
      // as the 5-digit variant — matches printer behaviour where
      // the 5-digit form is the common case (ISBN price, magazine
      // sequence) and bwip-js rejects other lengths outright.
      // HRI digits sit ABOVE the bars per Zebra firmware. Rendered
      // as a separate Konva Text overlay (same pattern as logmars)
      // so all four rotations land at the firmware-correct anchor
      // via getRotatedTextAnchor; bwip's own includetext would
      // bake the text into the bitmap and rotate with it.
      const text = p.content || "00000";
      const variantBcid = text.length === 2 ? "ean2" : "ean5";
      opts = {
        bcid: variantBcid,
        text,
        scale,
        height: 10,
      };
      break;
    }
    case "code128": {
      const p = obj.props;
      const scale = bwipScale1D(p.moduleWidth, renderScale, renderDpmm);
      const text = p.content || "0";
      // Note: ZPL ^BC e=Y (checkDigit) only prints the MOD-10 digit in the
      // interpretation line — it does NOT append it to the encoded barcode data.
      // ZPL escape sequences (e.g. `>5` for FNC1, `>9` for Code-C switch with
      // FNC1) require parsefnc auto-mode so bwip emits the same compact symbol
      // count Zebra firmware does. Plain ASCII falls through to the raw Code B
      // path which keeps the existing module count behaviour unchanged.
      const escaped = parseZplCode128Escapes(text);
      if (escaped !== null) {
        opts = { bcid, text: escaped, parsefnc: true, scale, height: 10 };
        break;
      }
      const rawB = toCode128BRaw(text);
      if (rawB) {
        opts = { bcid, text: rawB, raw: true, scale, height: 10 };
      } else {
        opts = { bcid, text, scale, height: 10 };
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
      const scale = bwipScale1D(p.moduleWidth, renderScale, renderDpmm);
      // Code39/Codabar/Plessey only encode uppercase letters. Zebra firmware
      // (and Labelary) silently uppercase lowercase input; bwip-js does not and
      // throws instead, which would crash the canvas for any imported ZPL with
      // lowercase content. Uppercase here so the lib matches firmware behaviour
      // without rewriting the user's source.
      const needsUpper = obj.type === "code39" || obj.type === "codabar" || obj.type === "plessey";
      const raw = p.content || "0";
      const text = needsUpper ? raw.toUpperCase() : raw;
      opts = { bcid, text, scale, height: 10 };
      break;
    }
    case "msi": {
      const p = obj.props;
      const scale = bwipScale1D(p.moduleWidth, renderScale, renderDpmm);
      // Zebra always encodes a Mod10 check digit in MSI regardless of the ^BM e=N
      // parameter (which only suppresses it in the interpretation line).
      opts = { bcid, text: p.content || "0", scale, height: 10, includecheck: true };
      break;
    }
    case "postal": {
      const p = obj.props;
      const scale = bwipScale1D(p.moduleWidth, renderScale, renderDpmm);
      opts = { bcid, text: p.content || "0", scale, height: 10 };
      break;
    }
    case "logmars": {
      const p = obj.props;
      const scale = bwipScale1D(p.moduleWidth, renderScale, renderDpmm);
      // LOGMARS is a Code39 subset; same uppercase rule applies.
      opts = {
        bcid,
        text: (p.content || "0").toUpperCase(),
        scale,
        height: 10,
        includecheck: true,
      };
      break;
    }
    case "gs1databar": {
      const p = obj.props;
      const scale = bwipScale1D(p.moduleWidth, renderScale, renderDpmm);
      const sym = p.symbology;
      const isExpanded = GS1_DATABAR_EXPANDED_SYMBOLOGIES.has(sym);
      // bwip-js needs (AI)data parens; canonical model stores raw digits.
      // Sym 1–5 require AI 01 + valid 14-digit GTIN with correct check.
      const text = isExpanded
        ? gs1ExpandedBwipText(p.content)
        : `(01)${gtin14WithCheck(p.content)}`;
      opts = {
        bcid: GS1_DATABAR_BCID[sym],
        text,
        scale,
        height: 10,
        paddingheight: GS1_DATABAR_PADDING_ROWS,
        ...(sym === 7 ? { segments: p.segments ?? GS1_DATABAR_DEFAULT_SEGMENTS } : {}),
      };
      break;
    }
    case "planet": {
      const p = obj.props;
      const scale = bwipScale1D(p.moduleWidth, renderScale, renderDpmm);
      let raw = (p.content || "0").replace(/\D/g, "");
      if (raw.length < 11) raw = raw.padStart(11, "0");
      else if (raw.length === 12) raw = raw.padStart(13, "0");
      opts = {
        bcid,
        text: raw,
        scale,
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

  if (rotation !== "N") {
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

/**
 * Display size of a barcode bbox in pixels.
 *
 *  `w` × `h` is the full footprint Zebra firmware reserves on the print —
 *  this includes any text zone that may sit on one side of the bars. The
 *  bars themselves occupy a sub-rectangle described by
 *  `(barLeftPx, barTopPx, barW, barH)`. For symbologies without a text
 *  zone or for rotations the text zone hasn't been mapped onto, the bar
 *  rect equals the full bbox.
 *
 *  Renderers should draw the bwip-js bitmap inside the bar sub-rectangle so
 *  the bars appear at their true height, while the Konva Group / hit area
 *  spans the full bbox so selection-handles match the printed footprint.
 */
export interface BarcodeDisplaySize {
  w: number;
  h: number;
  barW: number;
  barH: number;
  barLeftPx: number;
  barTopPx: number;
  /** Sub-rect of the bwip-js canvas to render (in source pixel coords).
   *  Lets the renderer skip bwip's internal padding, e.g. the
   *  paddingheight pad on GS1 DataBar that would otherwise leave the
   *  bars proportionally shorter than the firmware-reserved bbox.
   *  Undefined = use the full canvas. */
  bitmapCrop?: { x: number; y: number; width: number; height: number };
}

/** Anchor coordinates for a Konva Text node that is rotated alongside a
 *  1D barcode. Exactly one field is meaningful per rotation: `sideX` for
 *  R / B, `topY` for I. The other is set to 0 and ignored by the caller. */
export interface RotatedTextAnchor {
  sideX: number;
  topY: number;
}

/**
 * Where to place the rotated HRI text node so it sits `textGap` dots away
 * from the bars on the firmware-correct side.
 *
 * Naive sideX = -textGap / w + textGap anchors against the bbox edge,
 * which double-counts the firmware text zone (EAN/UPC: 13 dots, logmars:
 * 20 dots). Anchoring against the bar sub-rectangle (`barLeftPx`/`bw` for
 * R/B, `barTopPx`/`bh` for I) keeps the gap at exactly `textGap`
 * regardless of which side the text zone sits on.
 *
 * Konva rotates around the node origin, so the anchor accounts for the
 * text glyph extending in the rotation-opposite direction. For R (CW 90)
 * with text on the right, the glyph extends LEFT of `sideX` by
 * `textFontSize`, so we offset by +textFontSize. Mirror for B (CCW 90)
 * and I (180).
 */
export function getRotatedTextAnchor(
  rotation: "R" | "B" | "I",
  isTextAbove: boolean,
  dim: Pick<BarcodeDisplaySize, "barLeftPx" | "barTopPx" | "barW" | "barH">,
  textGap: number,
  textFontSize: number,
): RotatedTextAnchor {
  const { barLeftPx: btX, barTopPx: btY, barW: bw, barH: bh } = dim;
  if (rotation === "R") {
    return {
      sideX: isTextAbove ? btX + bw + textGap + textFontSize : btX - textGap,
      topY: 0,
    };
  }
  if (rotation === "B") {
    return {
      sideX: isTextAbove ? btX - textGap - textFontSize : btX + bw + textGap,
      topY: 0,
    };
  }
  // I (180°): text glyph extends UP from the origin, so a text-below-in-
  // upright glyph (now top after flip) anchors at btY - textGap; a
  // text-above-in-upright glyph (now bottom) anchors at btY + bh +
  // textGap + textFontSize.
  return {
    sideX: 0,
    topY: isTextAbove ? btY + bh + textGap + textFontSize : btY - textGap,
  };
}

/** Firmware-reserved text-zone height in dots, keyed by symbology. The
 *  zone sits below the bars in upright orientation; rotation maps it to
 *  another side of the bbox in getDisplaySize. Types not listed have no
 *  reserved zone. */
const TEXT_ZONE_DOTS_BY_TYPE: Partial<Record<LabelObject["type"], number>> = {
  ean13: EAN_TEXT_ZONE_DOTS,
  ean8: EAN_TEXT_ZONE_DOTS,
  upca: EAN_TEXT_ZONE_DOTS,
  upce: EAN_TEXT_ZONE_DOTS,
  logmars: LOGMARS_TEXT_ZONE_DOTS,
};

export function getDisplaySize(
  obj: LeafObject,
  canvas: HTMLCanvasElement,
  scale: number,
  dpmm: number,
): BarcodeDisplaySize {
  if (!canvas) {
    return {
      w: 0, h: 0, barW: 0, barH: 0, barLeftPx: 0, barTopPx: 0,
    };
  }

  // For 90°/270° rotations, bwip-js produces a bitmap whose width and height
  // are swapped relative to the upright form. Compute size as if upright (the
  // existing per-symbology formulas all assume that), then swap at the end.
  const rotation = objectRotation(obj.props);
  const isQuarter = rotation === "R" || rotation === "B";
  const cw = isQuarter ? canvas.height : canvas.width;
  const ch = isQuarter ? canvas.width : canvas.height;
  const upright = getUprightDisplaySize(obj, cw, ch, scale, dpmm);

  // Bbox after rotation.
  const w = isQuarter ? upright.h : upright.w;
  const h = isQuarter ? upright.w : upright.h;

  // Text-zone reservation in upright orientation, on the "below" side of
  // the bars per Labelary's bbox. Zero for symbologies without one.
  // ^BS supplements reserve the zone ABOVE the bars in upright (N);
  // bookkeeping reuses the same px value but flips which side gets
  // the offset.
  // ^BS reserves the text zone only when printInterpretation=Y; with
  // f=N the printer prints bars only and bbox = bar height. Other
  // EAN/UPC reserve the 13-dot zone unconditionally (Zebra firmware
  // ships a fixed text guard even when N).
  const textZoneDots =
    obj.type === "upcEanExtension"
      ? obj.props.printInterpretation ? UPC_SUPP_TEXT_ZONE_DOTS : 0
      : TEXT_ZONE_DOTS_BY_TYPE[obj.type] ?? 0;
  const textZonePx = dotsToPx(textZoneDots, scale, dpmm);
  // Source of truth for textAbove is the registry's HriBehavior — same
  // field BarcodeObject consumes for its overlay positioning. Without
  // this the bbox places bars at the top and reserves the zone at the
  // bottom, but the renderer draws the text above the bars at negative
  // y → text leaks out of the bbox. Bug spotted by gemini on PR #90.
  const isTextAbove = ObjectRegistry[obj.type]?.hri?.textAbove ?? false;

  // Map the upright "below the bars" zone onto the rotated bbox: it travels
  // around the rectangle as the symbol rotates.
  //   N (0°)   text zone at bottom → barTopPx=0,           barH = h - textZonePx
  //   R (90°)  text zone at left   → barLeftPx=textZonePx, barW = w - textZonePx
  //   I (180°) text zone at top    → barTopPx=textZonePx,  barH = h - textZonePx
  //   B (270°) text zone at right  → barLeftPx=0,          barW = w - textZonePx
  let barTopPx = 0;
  let barLeftPx = 0;
  let barW = w;
  let barH = h;
  if (textZonePx > 0) {
    // isTextAbove flips the upright zone from "below the bars" to "above
    // the bars" (and the corresponding rotated edges) without duplicating
    // the rotation table.
    if (!isTextAbove) {
      switch (rotation) {
        case "N": barH = h - textZonePx; break;
        case "R": barLeftPx = textZonePx; barW = w - textZonePx; break;
        case "I": barTopPx = textZonePx; barH = h - textZonePx; break;
        case "B": barW = w - textZonePx; break;
      }
    } else {
      switch (rotation) {
        case "N": barTopPx = textZonePx; barH = h - textZonePx; break;
        case "R": barW = w - textZonePx; break;
        case "I": barH = h - textZonePx; break;
        case "B": barLeftPx = textZonePx; barW = w - textZonePx; break;
      }
    }
  }

  // GS1 DataBar opts include `paddingheight: N`, which adds whitespace
  // rows on top and bottom of the bwip canvas. Without cropping them out,
  // the bitmap drawn at displayH leaves the bars proportionally shorter
  // than the spec-correct height. Zebra firmware fills the full reserved
  // height with bars; mirror that by cropping the source bitmap to the
  // bar-only rows.
  //
  // Rotation flips which axis the padding sits on. For N / I the padding
  // is on top/bottom of the bitmap as bwip produced it; for R / B (bwip
  // rotated 90° CW / CCW respectively) the same rows end up on the
  // left/right edges, so the crop must run along the x-axis instead.
  let bitmapCrop: BarcodeDisplaySize["bitmapCrop"];
  if (obj.type === "gs1databar") {
    const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
    const padPx = GS1_DATABAR_PADDING_ROWS * bwipSc;
    const axisDim = isQuarter ? canvas.width : canvas.height;
    if (axisDim > 2 * padPx) {
      bitmapCrop = isQuarter
        ? {
            x: padPx,
            y: 0,
            width: canvas.width - 2 * padPx,
            height: canvas.height,
          }
        : {
            x: 0,
            y: padPx,
            width: canvas.width,
            height: canvas.height - 2 * padPx,
          };
    }
  }

  return { w, h, barW, barH, barLeftPx, barTopPx, bitmapCrop };
}

function getUprightDisplaySize(
  obj: LeafObject,
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
      // bwip-js uses a narrower quiet zone than Zebra firmware. The
      // shortfall is content-independent — a fixed module count per
      // symbology — so we add it to the bwip module count to recover
      // the ZPL-correct print width. The bitmap stretches ~10-25% to
      // fill the wider bbox; bars look slightly broader than the
      // printed output but dimensions match.
      const delta = obj.type === "code93"
        ? CODE93_QUIET_ZONE_DELTA_MODULES
        : CODE11_QUIET_ZONE_DELTA_MODULES;
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const w = ((cw / bwipSc) + delta) * modulePx;
      const h = dotsToPx(obj.props.height, scale, dpmm);
      return { w, h };
    }
    case "plessey": {
      // bwip-js uses a fundamentally different bar encoding from Zebra
      // ^BP — bwip renders ~67% wider than Zebra for the same content.
      // Both encodings grow linearly with content, so a constant ratio
      // suffices. The bitmap squeezes to ~60% of its intrinsic width;
      // bars look compressed but the printed footprint matches.
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const w =
        (cw / bwipSc) * modulePx * PLESSEY_BWIP_TO_ZEBRA_WIDTH_RATIO;
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
      // bwip-js renders most non-stacked variants at the omni (33-module)
      // height regardless of the actual symbology, so trusting `ch` would
      // overstate the height for sym 2/5/6 and understate it for sym 4.
      // Use the spec-defined module count instead.
      //
      // Sym 7 (Expanded Stacked) cannot be Labelary-cross-validated:
      // bwip-js needs the (AI)data parens-AI input format, Zebra ^BR sym 7
      // silently rejects that input and renders an empty PNG, so neither
      // direction can produce a shared ground truth. The bwip-natural
      // canvas height is used as a best-effort approximation; the rendered
      // size therefore matches what the user sees in bwip's preview but
      // is not guaranteed to match Zebra firmware's actual print output.
      const specModules = GS1_DATABAR_SPEC_HEIGHT_MODULES[obj.props.symbology];
      const h = specModules !== undefined
        ? specModules * modulePx
        : (ch / bwipSc) * modulePx;
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
      // EAN/UPC reserves a 13-dot text zone below the bars in firmware,
      // even when printInterpretation=N. Include it in the bbox so the
      // selection footprint matches the printed extent.
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const extraPx = bwipSc === 1 ? 1 : 0;
      const w = ((cw - extraPx) / bwipSc) * modulePx;
      const h = dotsToPx(obj.props.height + EAN_TEXT_ZONE_DOTS, scale, dpmm);
      return { w, h };
    }
    case "upcEanExtension": {
      // ^BS prints the human-readable digits ABOVE the bars (unlike the
      // main EAN/UPC text band below), and Zebra reserves a larger
      // vertical zone for it only when printInterpretation=Y. With
      // f=N the bbox collapses to bar height (no guard reservation,
      // unlike main UPC/EAN which always reserves 13). Measured
      // against Labelary at 80-bar height: Y → 98, N → 80.
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const extraPx = bwipSc === 1 ? 1 : 0;
      const w = ((cw - extraPx) / bwipSc) * modulePx;
      const zone = obj.props.printInterpretation ? UPC_SUPP_TEXT_ZONE_DOTS : 0;
      const h = dotsToPx(obj.props.height + zone, scale, dpmm);
      return { w, h };
    }
    case "logmars": {
      // LOGMARS reserves a text zone above the bars (per spec) regardless of
      // printInterpretation. Include LOGMARS_TEXT_ZONE_DOTS so the bbox
      // matches the firmware footprint; bwip's bitmap covers only the bar
      // portion and is rendered at the bottom of the bbox.
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const extraPx = bwipSc === 1 ? 1 : 0;
      const w = ((cw - extraPx) / bwipSc) * modulePx;
      const h = dotsToPx(obj.props.height + LOGMARS_TEXT_ZONE_DOTS, scale, dpmm);
      return { w, h };
    }
    case "code39":
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
