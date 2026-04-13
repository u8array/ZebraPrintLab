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
import type { ImageProps } from '../registry/image';
import type { Barcode1DProps } from '../registry/barcode1d';
import type { Pdf417Props } from '../registry/pdf417';
import { putImage } from './imageCache';

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

function makeObj(type: string, x: number, y: number, props: unknown, positionType?: 'FO' | 'FT'): LabelObject {
  return { id: crypto.randomUUID(), type, x, y, rotation: 0, positionType, props } as LabelObject;
}

/** Decode ^FH hex escapes: replaces {delimiter}XX with the character for hex XX */
function decodeFH(text: string, delimiter: string): string {
  const escaped = delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`${escaped}([0-9A-Fa-f]{2})`, 'g'), (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

/**
 * Decompress ZPL Alternative Data Compression used in ^GFA fields.
 *
 * Compression characters:
 *   G–Y (uppercase) → repeat next hex digit 1–19 times
 *   g–z (lowercase) → repeat next hex digit 20–400 times (multiples of 20)
 *   Combinable: e.g. hI0 = (40+3) × '0' = 43 zeros
 *   ,  → fill remainder of current row with '0'
 *   !  → fill remainder of current row with 'F'
 *   :  → repeat previous row
 */
function decompressGFA(data: string, bytesPerRow: number): string {
  const nibblesPerRow = bytesPerRow * 2;
  const rows: string[] = [];
  let currentRow = '';
  let i = 0;

  const isHex = (ch: string) => /[0-9A-Fa-f]/.test(ch);
  const repeatCount = (ch: string): number => {
    if (ch >= 'G' && ch <= 'Y') return ch.charCodeAt(0) - 70; // G=1 .. Y=19
    if (ch >= 'g' && ch <= 'z') return (ch.charCodeAt(0) - 102) * 20; // g=20 .. z=400
    return 0;
  };
  const isCompressChar = (ch: string) =>
    (ch >= 'G' && ch <= 'Y') || (ch >= 'g' && ch <= 'z');

  const pushRow = () => {
    rows.push(currentRow.slice(0, nibblesPerRow).padEnd(nibblesPerRow, '0'));
    currentRow = '';
  };

  while (i < data.length) {
    const ch = data[i] ?? '';

    if (ch === ',') {
      // Fill rest of row with '0', complete row
      pushRow();
      i++;
    } else if (ch === '!') {
      // Fill rest of row with 'F', complete row
      currentRow = currentRow.padEnd(nibblesPerRow, 'F');
      rows.push(currentRow.slice(0, nibblesPerRow));
      currentRow = '';
      i++;
    } else if (ch === ':') {
      // Repeat previous row
      rows.push(rows.length > 0 ? rows[rows.length - 1] ?? '0'.repeat(nibblesPerRow) : '0'.repeat(nibblesPerRow));
      i++;
    } else if (isCompressChar(ch)) {
      // Accumulate repeat count (lowercase + uppercase can combine)
      let count = repeatCount(ch);
      i++;
      while (i < data.length && isCompressChar(data[i] ?? '')) {
        count += repeatCount(data[i] ?? '');
        i++;
      }
      // Next character is the hex digit to repeat
      const nextCh = data[i] ?? '';
      if (i < data.length && isHex(nextCh)) {
        currentRow += nextCh.repeat(count);
        i++;
      }
    } else if (isHex(ch)) {
      currentRow += ch;
      i++;
    } else {
      // Skip whitespace / unknown
      i++;
    }

    // If row is complete, push it
    if (currentRow.length >= nibblesPerRow) {
      rows.push(currentRow.slice(0, nibblesPerRow));
      currentRow = currentRow.slice(nibblesPerRow);
    }
  }

  // Handle any remaining partial row
  if (currentRow.length > 0) {
    pushRow();
  }

  return rows.join('');
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
  // ^FR field reverse (single-field reverse, reset on ^FS / new ^FO / ^FT)
  let frActive = false;

  // ^LH label home (origin offset applied to all field positions)
  let lhX = 0;
  let lhY = 0;

  // ^FH state (field hex indicator)
  let fhActive = false;
  let fhDelimiter = '_';

  // ^FT vs ^FO: store position type so we can reproduce exactly in re-export.
  let positionIsFT = false;

  // ^CF (change alphanumeric default font) state
  let cfHeight = 0;
  let cfWidth = 0;

  // ^FW (field default rotation) state
  let fwRotation: TextProps['rotation'] = 'N';

  // ^FB (field block) state — applied to next text field, then reset
  let fbWidth = 0;
  let fbLines = 1;
  let fbSpacing = 0;
  let fbJustify: TextProps['blockJustify'] = 'L';

  // PDF417 pending parameters
  let pdfRowHeight = 10;
  let pdfSecurity = 0;
  let pdfColumns = 0;

  const flushField = () => {
    if (!fieldType || pendingFD === null) return;
    const content = fhActive ? decodeFH(pendingFD, fhDelimiter) : pendingFD;
    const posType: 'FT' | 'FO' = positionIsFT ? 'FT' : 'FO';

    switch (fieldType) {
      case 'text': {
        const textProps: TextProps = {
            content,
            fontHeight: textH,
            fontWidth: textW,
            rotation: textRot,
            reverse: (lrActive || frActive) || undefined,
        };
        if (fbWidth > 0) {
          textProps.blockWidth = fbWidth;
          textProps.blockLines = fbLines;
          textProps.blockLineSpacing = fbSpacing;
          textProps.blockJustify = fbJustify;
        }
        objects.push(makeObj('text', x, y, textProps, posType));
        // Reset ^FB state after use
        fbWidth = 0;
        fbLines = 1;
        fbSpacing = 0;
        fbJustify = 'L';
        break;
      }
      case 'code128':
        objects.push(
          makeObj('code128', x, y, {
            content,
            height: bcHeight,
            moduleWidth: byModuleWidth,
            printInterpretation: bcInterp,
            checkDigit: bcCheck,
          } satisfies Code128Props, posType),
        );
        break;
      case 'code39':
        objects.push(
          makeObj('code39', x, y, {
            content,
            height: bcHeight,
            moduleWidth: byModuleWidth,
            printInterpretation: bcInterp,
            checkDigit: bcCheck,
          } satisfies Code39Props, posType),
        );
        break;
      case 'ean13':
        objects.push(
          makeObj('ean13', x, y, {
            content,
            height: bcHeight,
            moduleWidth: byModuleWidth,
            printInterpretation: bcInterp,
          } satisfies Ean13Props, posType),
        );
        break;
      case 'qrcode': {
        // content format from toZPL: "{ec}A,{data}"  e.g. "QA,https://example.com"
        const ec = (content[0] ?? 'Q') as QrCodeProps['errorCorrection'];
        const data = content.slice(3); // skip "{ec}A,"
        objects.push(
          makeObj('qrcode', x, y, {
            content: data,
            magnification: qrMag,
            errorCorrection: ec,
          } satisfies QrCodeProps, posType),
        );
        break;
      }
      case 'datamatrix':
        objects.push(
          makeObj('datamatrix', x, y, {
            content,
            dimension: dmDim,
            quality: dmQuality,
          } satisfies DataMatrixProps, posType),
        );
        break;
      case 'upca':
      case 'ean8':
      case 'upce':
      case 'interleaved2of5':
      case 'code93':
        objects.push(
          makeObj(fieldType, x, y, {
            content,
            height: bcHeight,
            moduleWidth: byModuleWidth,
            printInterpretation: bcInterp,
            checkDigit: bcCheck,
          } satisfies Barcode1DProps, posType),
        );
        break;
      case 'pdf417':
        objects.push(
          makeObj('pdf417', x, y, {
            content,
            rowHeight: pdfRowHeight,
            securityLevel: pdfSecurity,
            columns: pdfColumns,
            moduleWidth: byModuleWidth,
          } satisfies Pdf417Props, posType),
        );
        break;
    }

    fieldType = null;
    pendingFD = null;
    frActive = false;
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
        frActive = false;
        x = int(p[0]) + lhX;
        y = int(p[1]) + lhY;
        positionIsFT = false;
        break;
      }
      case 'FT': {
        flushField();
        frActive = false;
        x = int(p[0]) + lhX;
        y = int(p[1]) + lhY;
        positionIsFT = true;
        break;
      }

      // ── Text ──────────────────────────────────────────────────────
      case 'A0': {
        // ^A0{rotation},{height},{width}  e.g. ^A0N,30,0
        fieldType = 'text';
        textRot = (rest[0] as TextProps['rotation']) ?? fwRotation;
        textH = int(p[1], cfHeight || 30);
        textW = int(p[2], cfWidth || 0);
        break;
      }

      // ── Change alphanumeric default font ──────────────────────────
      case 'CF': {
        // ^CF{font},{height},{width}  → sets default for fields without ^A
        cfHeight = int(p[1], cfHeight);
        cfWidth = int(p[2], cfWidth);
        break;
      }

      // ── Field-wide default rotation ───────────────────────────────
      case 'FW': {
        // ^FW{rotation}  e.g. ^FWR
        const fw = (rest[0] ?? 'N').toUpperCase();
        if (fw === 'N' || fw === 'R' || fw === 'I' || fw === 'B') {
          fwRotation = fw;
        }
        break;
      }

      // ── Field block ───────────────────────────────────────────────
      case 'FB': {
        // ^FB{width},{lines},{lineSpacing},{justify},{hangingIndent}
        fbWidth = int(p[0], 0);
        fbLines = int(p[1], 1);
        fbSpacing = int(p[2], 0);
        const fbJ = (p[3] ?? 'L').toUpperCase();
        fbJustify = (fbJ === 'C' || fbJ === 'R' || fbJ === 'J') ? fbJ : 'L';
        // ^FB also implies text if no ^A was specified
        if (!fieldType) {
          fieldType = 'text';
          textH = cfHeight || 30;
          textW = cfWidth || 0;
          textRot = fwRotation;
        }
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
      case 'BU': {
        // ^BUN,{height},{interp},N,N — UPC-A
        fieldType = 'upca';
        bcHeight = int(p[1], byHeight || 100);
        bcInterp = (p[2] ?? 'Y') === 'Y';
        break;
      }
      case 'B8': {
        // ^B8N,{height},{interp},N — EAN-8
        fieldType = 'ean8';
        bcHeight = int(p[1], byHeight || 100);
        bcInterp = (p[2] ?? 'Y') === 'Y';
        break;
      }
      case 'B9': {
        // ^B9N,{height},{interp},N — UPC-E
        fieldType = 'upce';
        bcHeight = int(p[1], byHeight || 100);
        bcInterp = (p[2] ?? 'Y') === 'Y';
        break;
      }
      case 'B2': {
        // ^B2N,{height},{interp},N,{check} — Interleaved 2 of 5
        fieldType = 'interleaved2of5';
        bcHeight = int(p[1], byHeight || 100);
        bcInterp = (p[2] ?? 'Y') === 'Y';
        bcCheck = (p[4] ?? 'N') === 'Y';
        break;
      }
      case 'BA': {
        // ^BAN,{height},{interp},N,{check} — Code 93
        fieldType = 'code93';
        bcHeight = int(p[1], byHeight || 100);
        bcInterp = (p[2] ?? 'Y') === 'Y';
        bcCheck = (p[4] ?? 'N') === 'Y';
        break;
      }
      case 'B7': {
        // ^B7N,{rowHeight},{securityLevel},{columns},,, — PDF417
        fieldType = 'pdf417';
        pdfRowHeight = int(p[1], 10);
        pdfSecurity = int(p[2], 0);
        pdfColumns = int(p[3], 0);
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
        // Implicit text field: ^FD without a prior ^A uses ^CF defaults
        if (!fieldType) {
          fieldType = 'text';
          textH = cfHeight || 30;
          textW = cfWidth || 0;
          textRot = fwRotation;
        }
        pendingFD = rest;
        break;
      }
      case 'FS': {
        flushField();
        fhActive = false;
        positionIsFT = false;
        break;
      }

      // ── Label reverse / field reverse ────────────────────────────
      case 'LR': {
        lrActive = rest.toUpperCase().startsWith('Y');
        break;
      }
      case 'FR': {
        frActive = true;
        break;
      }

      // ── Label home (origin offset) ────────────────────────────────
      case 'LH': {
        lhX = int(p[0], 0);
        lhY = int(p[1], 0);
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
              reverse: (lrActive || frActive) || undefined,
            } satisfies LineProps),
          );
        } else if (w === t && h > t) {
          objects.push(
            makeObj('line', x, y, {
              angle: 90,
              length: h,
              thickness: t,
              color,
              reverse: (lrActive || frActive) || undefined,
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
              reverse: (lrActive || frActive) || undefined,
            } satisfies BoxProps),
          );
        }
        break;
      }
      case 'GD': {
        // ^GD{w},{h},{t},{color},{orientation}
        // orientation: L = top-left→bottom-right, R = top-right→bottom-left
        const gdW = int(p[0], 1);
        const gdH = int(p[1], 1);
        const gdT = int(p[2], 3);
        const gdColor = (p[3] ?? 'B') as 'B' | 'W';
        const gdOri = (p[4] ?? 'L').toUpperCase();
        const gdLen = Math.round(Math.sqrt(gdW * gdW + gdH * gdH));
        // Recover start point and angle from bounding-box FO position
        // 'L': dx>0,dy>0 → obj.x=boxX, angle=atan2(h,w)
        // 'R': dx<0,dy>0 → obj.x=boxX+w, angle=atan2(h,-w)
        const gdObjX = gdOri === 'R' ? x + gdW : x;
        const gdAngle = Math.round(
          gdOri === 'R'
            ? (Math.atan2(gdH, -gdW) * 180) / Math.PI
            : (Math.atan2(gdH, gdW) * 180) / Math.PI,
        );
        objects.push(
          makeObj('line', gdObjX, y, {
            angle: gdAngle,
            length: gdLen,
            thickness: gdT,
            color: gdColor,
            reverse: lrActive || frActive || undefined,
          } satisfies LineProps),
        );
        break;
      }
      case 'GF': {
        // ^GFA,{totalBytes},{totalBytes},{bytesPerRow},{compressedOrHexData}
        const format = rest[0]?.toUpperCase();
        if (format !== 'A') { skipped.push(`^GF${rest}`); break; }

        // Extract params: skip "A," then find 3rd comma to separate params from data
        const gfRest = rest.slice(2); // "total,total,bytesPerRow,data..."
        let commaPos = -1;
        for (let n = 0; n < 3; n++) {
          commaPos = gfRest.indexOf(',', commaPos + 1);
          if (commaPos === -1) break;
        }
        if (commaPos === -1) { skipped.push(`^GF${rest}`); break; }

        const gfParams = gfRest.slice(0, commaPos).split(',');
        const gfBytesPerRow = int(gfParams[2], 0);
        // Everything after the 3rd comma is the (possibly compressed) graphic data
        const gfRawData = gfRest.slice(commaPos + 1);

        if (gfBytesPerRow <= 0) { skipped.push(`^GF${rest}`); break; }

        // Decompress ZPL Alternative Data Compression for ^GFA
        const gfHex = decompressGFA(gfRawData, gfBytesPerRow);
        const gfWidthDots = gfBytesPerRow * 8;
        const gfTotalBytes = gfHex.length / 2;
        const gfHeightDots = Math.floor(gfTotalBytes / gfBytesPerRow);

        if (gfHeightDots <= 0) { skipped.push(`^GF${rest}`); break; }

        // Convert hex → 1-bit bitmap → canvas → data URL
        const canvas = document.createElement('canvas');
        canvas.width = gfWidthDots;
        canvas.height = gfHeightDots;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get 2d context');
        const imgData = ctx.createImageData(gfWidthDots, gfHeightDots);
        const pixels = imgData.data;

        for (let row = 0; row < gfHeightDots; row++) {
          for (let byteIdx = 0; byteIdx < gfBytesPerRow; byteIdx++) {
            const hexOffset = (row * gfBytesPerRow + byteIdx) * 2;
            const byte = parseInt(gfHex.slice(hexOffset, hexOffset + 2), 16) || 0;
            for (let bit = 0; bit < 8; bit++) {
              const px = byteIdx * 8 + bit;
              const idx = (row * gfWidthDots + px) * 4;
              const isBlack = (byte & (0x80 >> bit)) !== 0;
              pixels[idx] = isBlack ? 0 : 255;
              pixels[idx + 1] = isBlack ? 0 : 255;
              pixels[idx + 2] = isBlack ? 0 : 255;
              pixels[idx + 3] = 255;
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        const imageId = crypto.randomUUID();

        putImage({
          id: imageId,
          name: `imported_${imageId.slice(0, 8)}.png`,
          dataUrl,
          width: gfWidthDots,
          height: gfHeightDots,
        });

        // Store original compressed data for lossless re-export
        const gfaCache = `^GFA,${Math.floor(gfTotalBytes)},${Math.floor(gfTotalBytes)},${gfBytesPerRow},${gfRawData}`;

        const posType: 'FT' | 'FO' = positionIsFT ? 'FT' : 'FO';
        objects.push(
          makeObj('image', x, y, {
            imageId,
            widthDots: gfWidthDots,
            threshold: 128,
            _gfaCache: gfaCache,
          } satisfies ImageProps, posType),
        );
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
      case 'GC': {
        // ^GC{diameter},{thickness},{color}  → circle = ellipse with equal w/h
        const d = int(p[0], 100);
        const t = int(p[1], 3);
        const color = (p[2] ?? 'B') as 'B' | 'W';
        const filled = t >= d;
        objects.push(
          makeObj('ellipse', x, y, {
            width: d,
            height: d,
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
      case 'FX': // comment (ignored until next ^FS)
        break;

      default: {
        // ^A{font}{rotation},{height},{width}  — general font command (A-Z, 0-9)
        if (cmd[0] === 'A' && cmd.length === 2 && cmd !== 'A0') {
          fieldType = 'text';
          textRot = (rest[0] as TextProps['rotation']) ?? fwRotation;
          textH = int(p[1], cfHeight || 30);
          textW = int(p[2], cfWidth || 0);
          break;
        }
        // ^TB{rotation},{width},{height} — text block (alternative to ^A + ^FB)
        if (cmd === 'TB') {
          fieldType = 'text';
          textRot = (rest[0] as TextProps['rotation']) ?? fwRotation;
          const tbW = int(p[1], 0);
          const tbH = int(p[2], 0);
          textH = cfHeight || 30;
          textW = cfWidth || 0;
          if (tbW > 0) {
            fbWidth = tbW;
            fbLines = tbH > 0 ? Math.floor(tbH / (textH || 30)) : 1;
            fbJustify = 'L';
          }
          break;
        }
        // Record unknown commands (excluding pure whitespace tokens)
        if (rest.trim() || cmd.trim()) skipped.push(`^${cmd}${rest}`);
      }
    }
  }

  return { labelConfig, objects, skipped };
}
