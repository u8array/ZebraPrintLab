import type { LabelConfig } from '../types/ObjectType';
import type { LabelObject } from '../registry';
import type { TextProps } from '../registry/text';
import type { Code128Props } from '../registry/code128';
import type { Code39Props } from '../registry/code39';
import type { Ean13Props } from '../registry/ean13';
import type { QrCodeProps } from '../registry/qrcode';
import type { DataMatrixProps } from '../registry/datamatrix';
import type { BoxProps } from '../registry/box';
import type { EllipseProps } from '../registry/ellipse';
import type { LineProps } from '../registry/line';

export interface ParsedZPL {
  labelConfig: Partial<LabelConfig>;
  objects: LabelObject[];
  /** Commands that were not recognised / could not be mapped to an object */
  skipped: string[];
}

// ZPL commands are always exactly 2 characters (letter + letter or letter + digit)
function tokenize(zpl: string): { cmd: string; rest: string }[] {
  return zpl
    .split('^')
    .filter((p) => p.length >= 2)
    .map((p) => {
      const cmd = p.slice(0, 2).toUpperCase();
      const rest = p.slice(2);
      return { cmd, rest };
    });
}

function int(s: string | undefined, fallback = 0): number {
  const n = parseInt(s ?? '', 10);
  return isNaN(n) ? fallback : n;
}

function makeObj(type: string, x: number, y: number, props: unknown): LabelObject {
  return { id: crypto.randomUUID(), type, x, y, rotation: 0, props } as LabelObject;
}

/** Decode ^FH hex escapes: replaces {delimiter}XX with the character for hex XX */
function decodeFH(text: string, delimiter: string): string {
  const escaped = delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`${escaped}([0-9A-Fa-f]{2})`, 'g'), (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

export function parseZPL(zpl: string, dpmm = 8): ParsedZPL {
  const tokens = tokenize(zpl);
  const objects: LabelObject[] = [];
  const labelConfig: Partial<LabelConfig> = {};
  const skipped: string[] = [];

  let x = 0;
  let y = 0;
  // which barcode/text command is pending a ^FD payload
  let fieldType: string | null = null;
  let pendingFD: string | null = null;

  // cached per-field parameters
  let textRot: TextProps['rotation'] = 'N';
  let textH = 30;
  let textW = 0;
  let bcHeight = 100;
  let bcInterp = true;
  let bcCheck = false;
  // ^BY barcode defaults
  let byModuleWidth = 2;
  let byHeight = 0;
  let qrMag = 4;
  let dmDim = 5;
  let dmQuality: DataMatrixProps['quality'] = 200;

  // ^LR state (label reverse / invert)
  let lrActive = false;

  // ^FH state (field hex indicator)
  let fhActive = false;
  let fhDelimiter = '_';

  // ^FT baseline correction: FT positions at the text baseline, FO at top-left corner.
  // The offset must be applied at flush time (after ^A0 sets fontHeight/rotation).
  let positionIsFT = false;

  const ftCorrectedPos = (): { ox: number; oy: number } => {
    if (!positionIsFT) return { ox: x, oy: y };
    switch (fieldType) {
      case 'text':
        if (textRot === 'N') return { ox: x, oy: y - textH };
        if (textRot === 'R') return { ox: x - textH, oy: y };
        // I (180°) and B (270°): typeset point is at top edge — no offset needed
        break;
      case 'code128':
      case 'code39':
      case 'ean13':
        return { ox: x, oy: y - bcHeight };
      case 'qrcode':
        return { ox: x, oy: y - qrMag * 25 };
      case 'datamatrix':
        return { ox: x, oy: y - dmDim * 20 };
    }
    return { ox: x, oy: y };
  };

  const flushField = () => {
    if (!fieldType || pendingFD === null) return;
    const content = fhActive ? decodeFH(pendingFD, fhDelimiter) : pendingFD;
    const { ox, oy } = ftCorrectedPos();

    switch (fieldType) {
      case 'text':
        objects.push(
          makeObj('text', ox, oy, {
            content,
            fontHeight: textH,
            fontWidth: textW,
            rotation: textRot,
            reverse: lrActive || undefined,
          } satisfies TextProps),
        );
        break;
      case 'code128':
        objects.push(
          makeObj('code128', ox, oy, {
            content,
            height: bcHeight,
            moduleWidth: byModuleWidth,
            printInterpretation: bcInterp,
            checkDigit: bcCheck,
          } satisfies Code128Props),
        );
        break;
      case 'code39':
        objects.push(
          makeObj('code39', ox, oy, {
            content,
            height: bcHeight,
            moduleWidth: byModuleWidth,
            printInterpretation: bcInterp,
            checkDigit: bcCheck,
          } satisfies Code39Props),
        );
        break;
      case 'ean13':
        objects.push(
          makeObj('ean13', ox, oy, {
            content,
            height: bcHeight,
            moduleWidth: byModuleWidth,
            printInterpretation: bcInterp,
          } satisfies Ean13Props),
        );
        break;
      case 'qrcode': {
        // content format from toZPL: "{ec}A,{data}"  e.g. "QA,https://example.com"
        const ec = (content[0] ?? 'Q') as QrCodeProps['errorCorrection'];
        const data = content.slice(3); // skip "{ec}A,"
        objects.push(
          makeObj('qrcode', ox, oy, {
            content: data,
            magnification: qrMag,
            errorCorrection: ec,
          } satisfies QrCodeProps),
        );
        break;
      }
      case 'datamatrix':
        objects.push(
          makeObj('datamatrix', ox, oy, {
            content,
            dimension: dmDim,
            quality: dmQuality,
          } satisfies DataMatrixProps),
        );
        break;
    }

    fieldType = null;
    pendingFD = null;
  };

  for (const { cmd, rest } of tokens) {
    const p = rest.split(',');

    switch (cmd) {
      // ── Label dimensions ──────────────────────────────────────────
      case 'PW': {
        const dots = int(rest);
        if (dots > 0) labelConfig.widthMm = Math.round((dots / dpmm) * 10) / 10;
        break;
      }
      case 'LL': {
        const dots = int(rest);
        if (dots > 0) labelConfig.heightMm = Math.round((dots / dpmm) * 10) / 10;
        break;
      }

      // ── Field origin ──────────────────────────────────────────────
      case 'FO': {
        flushField();
        x = int(p[0]);
        y = int(p[1]);
        positionIsFT = false;
        break;
      }
      case 'FT': {
        flushField();
        x = int(p[0]);
        y = int(p[1]);
        positionIsFT = true;
        break;
      }

      // ── Text ──────────────────────────────────────────────────────
      case 'A0': {
        // ^A0{rotation},{height},{width}  e.g. ^A0N,30,0
        fieldType = 'text';
        textRot = (rest[0] as TextProps['rotation']) ?? 'N';
        textH = int(p[1], 30);
        textW = int(p[2], 0);
        break;
      }

      // ── Barcode defaults ──────────────────────────────────────────
      case 'BY': {
        // ^BY{module_width},{ratio},{height}
        byModuleWidth = int(p[0], 2);
        byHeight = int(p[2], 0);
        break;
      }

      // ── Barcodes ──────────────────────────────────────────────────
      case 'BC': {
        // ^BCN,{height},{interp},N,{check}
        fieldType = 'code128';
        bcHeight = int(p[1], byHeight || 100);
        bcInterp = (p[2] ?? 'Y') === 'Y';
        bcCheck = (p[4] ?? 'N') === 'Y';
        break;
      }
      case 'B3': {
        // ^B3N,{check},{height},{interp},N
        fieldType = 'code39';
        bcCheck = (p[1] ?? 'N') === 'Y';
        bcHeight = int(p[2], byHeight || 100);
        bcInterp = (p[3] ?? 'Y') === 'Y';
        break;
      }
      case 'BE': {
        // ^BEN,{height},{interp},N
        fieldType = 'ean13';
        bcHeight = int(p[1], byHeight || 100);
        bcInterp = (p[2] ?? 'Y') === 'Y';
        break;
      }
      case 'BQ': {
        // ^BQN,2,{magnification}
        fieldType = 'qrcode';
        qrMag = int(p[2], 4);
        break;
      }
      case 'BX': {
        // ^BXN,{dimension},{quality}
        fieldType = 'datamatrix';
        dmDim = int(p[1], 5);
        dmQuality = (int(p[2], 200)) as DataMatrixProps['quality'];
        break;
      }

      // ── Field hex indicator ───────────────────────────────────────
      case 'FH': {
        fhActive = true;
        fhDelimiter = rest[0] ?? '_';
        break;
      }

      // ── Field data / separator ────────────────────────────────────
      case 'FD': {
        pendingFD = rest;
        break;
      }
      case 'FS': {
        flushField();
        fhActive = false;
        positionIsFT = false;
        break;
      }

      // ── Label reverse (invert colors) ─────────────────────────────
      case 'LR': {
        lrActive = rest.toUpperCase().startsWith('Y');
        break;
      }

      // ── Graphics ──────────────────────────────────────────────────
      case 'GB': {
        // ^GB{w},{h},{t},{color},{rounding}
        // ZPL: w=0 or h=0 means "use thickness value" for that dimension
        const t = int(p[2], 3);
        const rawW = int(p[0], t);
        const rawH = int(p[1], t);
        const w = rawW === 0 ? t : rawW;
        const h = rawH === 0 ? t : rawH;
        const color = (p[3] ?? 'B') as 'B' | 'W';
        const rounding = int(p[4], 0);

        // Distinguish line from box: a line has one dimension equal to thickness
        if (h === t && w > t) {
          objects.push(
            makeObj('line', x, y, {
              angle: 0,
              length: w,
              thickness: t,
              color,
              reverse: lrActive || undefined,
            } satisfies LineProps),
          );
        } else if (w === t && h > t) {
          objects.push(
            makeObj('line', x, y, {
              angle: 90,
              length: h,
              thickness: t,
              color,
              reverse: lrActive || undefined,
            } satisfies LineProps),
          );
        } else {
          const filled = t >= Math.min(w, h);
          objects.push(
            makeObj('box', x, y, {
              width: w,
              height: h,
              thickness: filled ? 3 : t,
              filled,
              color,
              rounding,
              reverse: lrActive || undefined,
            } satisfies BoxProps),
          );
        }
        break;
      }
      case 'GE': {
        // ^GE{w},{h},{t},{color}
        const w = int(p[0], 100);
        const h = int(p[1], 100);
        const t = int(p[2], 3);
        const color = (p[3] ?? 'B') as 'B' | 'W';
        const filled = t >= Math.min(w, h);
        objects.push(
          makeObj('ellipse', x, y, {
            width: w,
            height: h,
            thickness: filled ? 3 : t,
            filled,
            color,
          } satisfies EllipseProps),
        );
        break;
      }

      // ── Label print settings ──────────────────────────────────────
      case 'PQ': {
        const qty = int(p[0], 0);
        if (qty > 0) labelConfig.printQuantity = qty;
        break;
      }
      case 'MM': {
        const mode = (rest[0] ?? '').toUpperCase() as LabelConfig['mediaMode'];
        if (mode) labelConfig.mediaMode = mode;
        break;
      }
      case 'LS': {
        const shift = int(rest, 0);
        if (shift !== 0) labelConfig.labelShift = shift;
        break;
      }

      // ── Ignored / structural ──────────────────────────────────────
      case 'XA':
      case 'XZ':
      case 'CI': // character set encoding
      case 'MT': // media type
        break;

      default:
        // Record unknown commands (excluding pure whitespace tokens)
        if (rest.trim() || cmd.trim()) skipped.push(`^${cmd}${rest}`);
    }
  }

  return { labelConfig, objects, skipped };
}
