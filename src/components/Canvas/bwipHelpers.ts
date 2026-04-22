import type { LabelObject } from "../../registry";
import { dotsToPx } from "../../lib/coordinates";

const BCID: Record<string, string> = {
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
  aztec: "azteccode",
  micropdf417: "micropdf417",
  codablock: "codablockf",
};

const BWIP_SCALE = 2;
const BWIP_2D_INTERNAL_SCALE = 2;

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
): Record<string, unknown> | null {
  const bcid = BCID[obj.type];
  if (!bcid) return null;

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
      opts = { bcid, text, scale: BWIP_SCALE, height: 10 };
      break;
    }
    case "code128": {
      const p = obj.props;
      const text = p.content || "0";
      const rawB = toCode128BRaw(text);
      if (rawB) {
        opts = { bcid, text: rawB, raw: true, scale: BWIP_SCALE, height: 10 };
      } else {
        opts = { bcid, text, scale: BWIP_SCALE, height: 10 };
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
      opts = { bcid, text: p.content || "0", scale: BWIP_SCALE, height: 10 };
      break;
    }
    case "postal": {
      const p = obj.props;
      opts = { bcid, text: p.content || "0", scale: BWIP_SCALE, height: 10 };
      break;
    }
    case "logmars": {
      const p = obj.props;
      opts = {
        bcid,
        text: p.content || "0",
        scale: BWIP_SCALE,
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
        scale: BWIP_SCALE,
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
        scale: BWIP_SCALE,
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
        rowheight: Math.max(1, Math.round(p.rowHeight / Math.max(p.moduleWidth, 1))),
        columns: p.columns || 0,
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
        rowheight: Math.max(1, Math.round(p.rowHeight / Math.max(p.moduleWidth, 1))),
      };
      break;
    }
    case "codablock": {
      const p = obj.props;
      opts = {
        bcid,
        text: p.content || " ",
        scale: BWIP_SCALE,
        rowheight: Math.max(8, Math.round(p.rowHeight / Math.max(p.moduleWidth, 1))),
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
      const w = (canvas.width / BWIP_SCALE + 20) * modulePx;
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
      const w = (canvas.width / BWIP_SCALE) * modulePx;
      const h = dotsToPx(obj.props.height, scale, dpmm);
      return { w, h };
    }
    case "pdf417": {
      const ratio = dotsToPx(obj.props.moduleWidth, scale, dpmm) / BWIP_SCALE;
      return { w: canvas.width * ratio, h: canvas.height * ratio };
    }
    case "qrcode": {
      const modulePx = dotsToPx(obj.props.magnification, scale, dpmm);
      const size = (canvas.width / (BWIP_SCALE * BWIP_2D_INTERNAL_SCALE)) * modulePx;
      return { w: size, h: size };
    }
    case "datamatrix": {
      const modulePx = dotsToPx(obj.props.dimension, scale, dpmm);
      const size = (canvas.width / (BWIP_SCALE * BWIP_2D_INTERNAL_SCALE)) * modulePx;
      return { w: size, h: size };
    }
    case "aztec": {
      const modulePx = dotsToPx(obj.props.magnification, scale, dpmm);
      const size = (canvas.width / (BWIP_SCALE * BWIP_2D_INTERNAL_SCALE)) * modulePx;
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
