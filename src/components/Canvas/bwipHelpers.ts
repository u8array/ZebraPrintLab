import type { LabelObject } from "../../registry";
import { dotsToPx } from "../../lib/coordinates";

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
  standard2of5: "code2of5",
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
    case "msi":
    case "plessey": {
      const p = obj.props;
      opts = { bcid, text: p.content || "0", scale: scale1D, height: 10 };
      break;
    }
    case "postal": {
      const p = obj.props;
      opts = { bcid, text: p.content || "0", scale: scale1D, height: 10 };
      break;
    }
    case "logmars": {
      const p = obj.props;
      opts = {
        bcid,
        text: p.content || "0",
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
      opts = {
        bcid,
        text: p.content || " ",
        scale: BWIP_SCALE,
        rowheight: Math.max(
          1,
          Math.round(p.rowHeight / Math.max(p.moduleWidth, 1)),
        ),
        columns: p.columns || 0,
        // ZPL securityLevel 0 = auto, 1–8 = ECC level 0–7.
        // bwip eclevel 0 = ECC level 0, so the mapping is sec − 1.
        ...(p.securityLevel > 0
          ? { eclevel: String(p.securityLevel - 1) }
          : {}),
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

  return opts;
}

export function getDisplaySize(
  obj: LabelObject,
  canvas: HTMLCanvasElement,
  scale: number,
  dpmm: number,
): { w: number; h: number } {
  if (!canvas) return { w: 0, h: 0 };

  switch (obj.type) {
    case "msi":
    case "plessey": {
      // ZPL/Labelary includes 10 quiet-zone modules on each side; bwip renders bars only.
      // Add 20 modules to cover both quiet zones so canvas width matches Labelary.
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const w = (canvas.width / bwipSc + 20) * modulePx;
      const h = dotsToPx(obj.props.height, scale, dpmm);
      return { w, h };
    }
    case "ean13":
    case "ean8":
    case "upca":
    case "upce":
    case "code128":
    case "code39":
    case "interleaved2of5":
    case "code93":
    case "code11":
    case "industrial2of5":
    case "standard2of5":
    case "codabar":
    case "logmars":
    case "gs1databar":
    case "planet":
    case "postal": {
      const modulePx = dotsToPx(obj.props.moduleWidth, scale, dpmm);
      const bwipSc = get1DBwipScale(obj.props.moduleWidth, scale, dpmm);
      const w = (canvas.width / bwipSc) * modulePx;
      const h = dotsToPx(obj.props.height, scale, dpmm);
      return { w, h };
    }
    case "pdf417": {
      const p = obj.props;
      // bwip reduces rowheight to its internal minimum (3) when more rows are
      // requested than strictly needed. Detect this by checking divisibility:
      // if height is a multiple of (specifiedRowheight × BWIP_SCALE) bwip used
      // the specified value; otherwise it fell back to the minimum of 3.
      const specRowheight = Math.max(
        1,
        Math.round(p.rowHeight / Math.max(p.moduleWidth, 1)),
      );
      const usedSpecified = canvas.height % (specRowheight * BWIP_SCALE) === 0;
      const effectiveRowheight = usedSpecified ? specRowheight : 3;
      const numRows = canvas.height / (effectiveRowheight * BWIP_SCALE);
      const w =
        (canvas.width / BWIP_SCALE) * dotsToPx(p.moduleWidth, scale, dpmm);
      const h = numRows * dotsToPx(p.rowHeight, scale, dpmm);
      return { w, h };
    }
    case "qrcode": {
      const modulePx = dotsToPx(obj.props.magnification, scale, dpmm);
      const size =
        (canvas.width / (BWIP_SCALE * BWIP_2D_INTERNAL_SCALE)) * modulePx;
      return { w: size, h: size };
    }
    case "datamatrix": {
      const modulePx = dotsToPx(obj.props.dimension, scale, dpmm);
      const size =
        (canvas.width / (BWIP_SCALE * BWIP_2D_INTERNAL_SCALE)) * modulePx;
      return { w: size, h: size };
    }
    case "aztec": {
      const modulePx = dotsToPx(obj.props.magnification, scale, dpmm);
      const size =
        (canvas.width / (BWIP_SCALE * BWIP_2D_INTERNAL_SCALE)) * modulePx;
      return { w: size, h: size };
    }
    case "micropdf417":
    case "codablock": {
      const ratio = dotsToPx(obj.props.moduleWidth, scale, dpmm) / BWIP_SCALE;
      return { w: canvas.width * ratio, h: canvas.height * ratio };
    }
    default: {
      return { w: canvas.width, h: canvas.height };
    }
  }
}
