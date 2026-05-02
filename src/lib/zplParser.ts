import type { LabelConfig } from "../types/ObjectType";
import type { LabelObject } from "../registry";
import type { TextProps } from "../registry/text";
import type { Code128Props } from "../registry/code128";
import type { Code39Props } from "../registry/code39";
import type { Ean13Props } from "../registry/ean13";
import type { QrCodeProps } from "../registry/qrcode";
import type { DataMatrixProps } from "../registry/datamatrix";
import type { BoxProps } from "../registry/box";
import type { EllipseProps } from "../registry/ellipse";
import type { LineProps } from "../registry/line";
import type { ImageProps } from "../registry/image";
import type { Barcode1DProps } from "../registry/barcode1d";
import type { Pdf417Props } from "../registry/pdf417";
import type { SerialProps } from "../registry/serial";
import type { AztecProps } from "../registry/aztec";
import type { MicroPdf417Props } from "../registry/micropdf417";
import type { CodablockProps } from "../registry/codablock";
import { putImage } from "./imageCache";

/**
 * Categorised import report produced alongside the parsed objects.
 * Enables the UI to give the user precise, actionable feedback.
 */
export interface ImportReport {
  /** Commands that were imported with known loss (e.g. ^A@ → font face not available in browser).
   *  An object WAS created; something about it is approximate.  Deduplicated by command code. */
  partial: string[];
  /** Commands skipped because they require printer hardware or file storage
   *  (e.g. ^IM, ~DG). No object was created for these. */
  browserLimit: string[];
  /** Commands that were not recognised at all. No object was created for these. */
  unknown: string[];
}

export interface ParsedZPL {
  labelConfig: Partial<LabelConfig>;
  objects: LabelObject[];
  /** All commands that were not fully imported (browserLimit + unknown).
   *  Kept for backward compatibility; prefer importReport for categorised access. */
  skipped: string[];
  /** Categorised breakdown of import fidelity */
  importReport: ImportReport;
}

type Handler = (p: string[], rest: string) => void;

// ZPL commands start with ^ or ~ followed by 2 characters
function tokenize(zpl: string): { cmd: string; rest: string }[] {
  const tokens: { cmd: string; rest: string }[] = [];
  // Split on both ^ and ~ delimiters, preserving the delimiter type
  const parts = zpl.split(/(?=[\^~])/);
  for (const part of parts) {
    if (part.length < 3) continue; // need delimiter + 2-char command
    const delimiter = part[0];
    if (delimiter !== "^" && delimiter !== "~") continue;
    const cmd = part.slice(1, 3).toUpperCase();
    const rest = part.slice(3);
    tokens.push({ cmd, rest });
  }
  return tokens;
}

function int(s: string | undefined, fallback = 0): number {
  const n = parseInt(s ?? "", 10);
  return isNaN(n) ? fallback : n;
}

function makeObj(
  type: string,
  x: number,
  y: number,
  props: unknown,
  positionType?: "FO" | "FT",
  comment?: string,
): LabelObject {
  return {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    rotation: 0,
    positionType,
    comment,
    props,
  } as unknown as LabelObject;
}

/** Decode ^FH hex escapes: replaces {delimiter}XX with the character for hex XX */
function decodeFH(text: string, delimiter: string): string {
  const escaped = delimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`${escaped}([0-9A-Fa-f]{2})`, "g"), (_, hex) =>
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
  let currentRow = "";
  let i = 0;

  const isHex = (ch: string) => /[0-9A-Fa-f]/.test(ch);
  const repeatCount = (ch: string): number => {
    if (ch >= "G" && ch <= "Y") return ch.charCodeAt(0) - 70; // G=1 .. Y=19
    if (ch >= "g" && ch <= "z") return (ch.charCodeAt(0) - 102) * 20; // g=20 .. z=400
    return 0;
  };
  const isCompressChar = (ch: string) =>
    (ch >= "G" && ch <= "Y") || (ch >= "g" && ch <= "z");

  const pushRow = () => {
    rows.push(currentRow.slice(0, nibblesPerRow).padEnd(nibblesPerRow, "0"));
    currentRow = "";
  };

  while (i < data.length) {
    const ch = data[i] ?? "";

    if (ch === ",") {
      // Fill rest of row with '0', complete row
      pushRow();
      i++;
    } else if (ch === "!") {
      // Fill rest of row with 'F', complete row
      currentRow = currentRow.padEnd(nibblesPerRow, "F");
      rows.push(currentRow.slice(0, nibblesPerRow));
      currentRow = "";
      i++;
    } else if (ch === ":") {
      // Repeat previous row
      rows.push(
        rows.length > 0
          ? (rows[rows.length - 1] ?? "0".repeat(nibblesPerRow))
          : "0".repeat(nibblesPerRow),
      );
      i++;
    } else if (isCompressChar(ch)) {
      // Accumulate repeat count (lowercase + uppercase can combine)
      let count = repeatCount(ch);
      i++;
      while (i < data.length && isCompressChar(data[i] ?? "")) {
        count += repeatCount(data[i] ?? "");
        i++;
      }
      // Next character is the hex digit to repeat
      const nextCh = data[i] ?? "";
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

  return rows.join("");
}

export function parseZPL(zpl: string, dpmm = 8): ParsedZPL {
  const tokens = tokenize(zpl);
  const objects: LabelObject[] = [];
  const labelConfig: Partial<LabelConfig> = {};
  const skipped: string[] = [];
  const partialCmds = new Set<string>(); // deduplicates partial-import command codes
  const browserLimit: string[] = [];
  const unknown: string[] = [];
  let pendingComment: string | undefined;

  /** Consume and return the pending ^FX comment, then clear it. */
  const takeComment = (): string | undefined => {
    const c = pendingComment;
    pendingComment = undefined;
    return c;
  };

  let x = 0;
  let y = 0;
  // which barcode/text command is pending a ^FD payload
  let fieldType: string | null = null;
  let pendingFD: string | null = null;

  // cached per-field parameters
  let textRot: TextProps["rotation"] = "N";
  let textH = 30;
  let textW = 0;
  let bcHeight = 100;
  let bcInterp = true;
  let bcCheck = false;
  // ^BY barcode defaults
  let byModuleWidth = 2;
  let byHeight = 0; // 0 = no ^BY height; barcode handlers use ||100 as sentinel
  let qrMag = 4;
  let dmDim = 5;
  let dmQuality: DataMatrixProps["quality"] = 200;

  // ^LR state (label reverse / invert)
  let lrActive = false;
  // ^FR field reverse (single-field reverse, reset on ^FS / new ^FO / ^FT)
  let frActive = false;

  // ^LH label home (origin offset applied to all field positions)
  let lhX = 0;
  let lhY = 0;

  // ^LT label top (vertical offset applied to all field positions)
  let ltY = 0;

  // ^FH state (field hex indicator)
  let fhActive = false;
  let fhDelimiter = "_";

  // ^FT vs ^FO: store position type so we can reproduce exactly in re-export.
  let positionIsFT = false;

  // ^CF (change alphanumeric default font) state
  let cfHeight = 0;
  let cfWidth = 0;

  // ^FW (field default rotation) state
  let fwRotation: TextProps["rotation"] = "N";

  // ^FB (field block) state — applied to next text field, then reset
  let fbWidth = 0;
  let fbLines = 1;
  let fbSpacing = 0;
  let fbJustify: TextProps["blockJustify"] = "L";

  // PDF417 pending parameters
  let pdfRowHeight = 10;
  let pdfSecurity = 0;
  let pdfColumns = 0;

  // Aztec pending parameters
  let aztecMag = 4;

  // MicroPDF417 pending parameters
  let mpdfRowHeight = 10;

  // CODABLOCK pending parameters
  let cbRowHeight = 10;
  let cbSecurity: CodablockProps["securityLevel"] = "Y";

  // ^A@ pending printer font name (e.g. "ARIAL.TTF")
  let pendingPrinterFontName: string | undefined;

  // ^SN / ^SF serialization state
  let snPending = false;
  let snIncrement = 1;
  let snMode: SerialProps["zplMode"] = "SN";

  const flushField = () => {
    if (!fieldType || pendingFD === null) return;
    const content = fhActive ? decodeFH(pendingFD, fhDelimiter) : pendingFD;
    const posType: "FT" | "FO" = positionIsFT ? "FT" : "FO";
    const comment = takeComment();

    // Decode \& line breaks in ^FB text blocks
    const decoded = fbWidth > 0 ? content.replace(/\\&/g, "\n") : content;

    switch (fieldType) {
      case "text": {
        // If ^SF was pending, create a serial object instead of text
        if (snPending) {
          objects.push(
            makeObj(
              "serial",
              x,
              y,
              {
                content: decoded,
                increment: snIncrement,
                fontHeight: textH,
                fontWidth: textW,
                rotation: textRot,
                zplMode: snMode,
              } satisfies SerialProps,
              posType,
              comment,
            ),
          );
          snPending = false;
          snIncrement = 1;
          snMode = "SN";
          fbWidth = 0;
          fbLines = 1;
          fbSpacing = 0;
          fbJustify = "L";
          break;
        }
        const textProps: TextProps = {
          content: decoded,
          fontHeight: textH,
          fontWidth: textW,
          rotation: textRot,
          reverse: lrActive || frActive || undefined,
          printerFontName: pendingPrinterFontName,
        };
        pendingPrinterFontName = undefined;
        if (fbWidth > 0) {
          textProps.blockWidth = fbWidth;
          textProps.blockLines = fbLines;
          textProps.blockLineSpacing = fbSpacing;
          textProps.blockJustify = fbJustify;
        }
        objects.push(makeObj("text", x, y, textProps, posType, comment));
        // Reset ^FB state after use
        fbWidth = 0;
        fbLines = 1;
        fbSpacing = 0;
        fbJustify = "L";
        break;
      }
      case "code128":
        objects.push(
          makeObj(
            "code128",
            x,
            y,
            {
              content,
              height: bcHeight,
              moduleWidth: byModuleWidth,
              printInterpretation: bcInterp,
              checkDigit: bcCheck,
            } satisfies Code128Props,
            posType,
            comment,
          ),
        );
        break;
      case "code39":
        objects.push(
          makeObj(
            "code39",
            x,
            y,
            {
              content,
              height: bcHeight,
              moduleWidth: byModuleWidth,
              printInterpretation: bcInterp,
              checkDigit: bcCheck,
            } satisfies Code39Props,
            posType,
            comment,
          ),
        );
        break;
      case "ean13":
        objects.push(
          makeObj(
            "ean13",
            x,
            y,
            {
              content,
              height: bcHeight,
              moduleWidth: byModuleWidth,
              printInterpretation: bcInterp,
            } satisfies Ean13Props,
            posType,
            comment,
          ),
        );
        break;
      case "qrcode": {
        // content format from toZPL: "{ec}A,{data}"  e.g. "QA,https://example.com"
        const ec = (content[0] ?? "Q") as QrCodeProps["errorCorrection"];
        const data = content.slice(3); // skip "{ec}A,"
        objects.push(
          makeObj(
            "qrcode",
            x,
            y,
            {
              content: data,
              magnification: qrMag,
              errorCorrection: ec,
            } satisfies QrCodeProps,
            posType,
            comment,
          ),
        );
        break;
      }
      case "datamatrix":
        objects.push(
          makeObj(
            "datamatrix",
            x,
            y,
            {
              content,
              dimension: dmDim,
              quality: dmQuality,
            } satisfies DataMatrixProps,
            posType,
            comment,
          ),
        );
        break;
      case "upca":
      case "ean8":
      case "upce":
      case "interleaved2of5":
      case "code93":
      case "code11":
      case "industrial2of5":
      case "standard2of5":
      case "codabar":
      case "logmars":
      case "msi":
      case "plessey":
      case "gs1databar":
      case "planet":
      case "postal":
        objects.push(
          makeObj(
            fieldType,
            x,
            y,
            {
              content,
              height: bcHeight,
              moduleWidth: byModuleWidth,
              printInterpretation: bcInterp,
              checkDigit: bcCheck,
            } satisfies Barcode1DProps,
            posType,
            comment,
          ),
        );
        break;
      case "pdf417":
        objects.push(
          makeObj(
            "pdf417",
            x,
            y,
            {
              content,
              rowHeight: pdfRowHeight,
              securityLevel: pdfSecurity,
              columns: pdfColumns,
              moduleWidth: byModuleWidth,
            } satisfies Pdf417Props,
            posType,
            comment,
          ),
        );
        break;
      case "aztec":
        objects.push(
          makeObj(
            "aztec",
            x,
            y,
            {
              content,
              magnification: aztecMag,
              ecLevel: 0,
            } satisfies AztecProps,
            posType,
            comment,
          ),
        );
        break;
      case "micropdf417":
        objects.push(
          makeObj(
            "micropdf417",
            x,
            y,
            {
              content,
              moduleWidth: byModuleWidth,
              rowHeight: mpdfRowHeight,
              mode: 0,
            } satisfies MicroPdf417Props,
            posType,
            comment,
          ),
        );
        break;
      case "codablock":
        objects.push(
          makeObj(
            "codablock",
            x,
            y,
            {
              content,
              moduleWidth: byModuleWidth,
              rowHeight: cbRowHeight,
              securityLevel: cbSecurity,
            } satisfies CodablockProps,
            posType,
            comment,
          ),
        );
        break;
    }

    fieldType = null;
    pendingFD = null;
    frActive = false;
  };

  // ── Command handler map ────────────────────────────────────────────────────
  const noop: Handler = () => void 0;
  const resetComment: Handler = (_, rest) => { pendingComment = rest.trim() || undefined; };
  const mkBrowserLimit = (prefix: string, delimiter = "^"): Handler => (_, rest) => {
    const tok = `${delimiter}${prefix}${rest}`;
    skipped.push(tok);
    browserLimit.push(tok);
  };

  const handleAztec: Handler = (p) => { fieldType = "aztec"; aztecMag = int(p[1], 4); };

  const handlers: Record<string, Handler> = {
    // ── Label dimensions ────────────────────────────────────────────────────
    PW(_, rest) {
      const dots = int(rest);
      if (dots > 0) labelConfig.widthMm = Math.round((dots / dpmm) * 10) / 10;
    },
    LL(_, rest) {
      const dots = int(rest);
      if (dots > 0) labelConfig.heightMm = Math.round((dots / dpmm) * 10) / 10;
    },

    // ── Field origin ────────────────────────────────────────────────────────
    FO(p) {
      flushField();
      frActive = false;
      x = int(p[0]) + lhX;
      y = int(p[1]) + lhY + ltY;
      // 3rd param is justification (0/1/2) — stored but not actively used
      positionIsFT = false;
    },
    FT(p) {
      flushField();
      frActive = false;
      x = int(p[0]) + lhX;
      y = int(p[1]) + lhY + ltY;
      positionIsFT = true;
    },

    // ── Text ────────────────────────────────────────────────────────────────
    // ^A0{rotation},{height},{width}  e.g. ^A0N,30,0
    A0(p, rest) {
      fieldType = "text";
      textRot = (rest[0] as TextProps["rotation"]) ?? fwRotation;
      textH = int(p[1], cfHeight || 30);
      textW = int(p[2], cfWidth || 0);
    },

    // ── Change alphanumeric default font ────────────────────────────────────
    // ^CF{font},{height},{width}  → sets default for fields without ^A
    CF(p) {
      cfHeight = int(p[1], cfHeight);
      cfWidth = int(p[2], cfWidth);
    },

    // ── Field-wide default rotation ─────────────────────────────────────────
    // ^FW{rotation}  e.g. ^FWR
    FW(_, rest) {
      const fw = (rest[0] ?? "N").toUpperCase();
      if (fw === "N" || fw === "R" || fw === "I" || fw === "B") {
        fwRotation = fw;
      }
    },

    // ── Field block ─────────────────────────────────────────────────────────
    // ^FB{width},{lines},{lineSpacing},{justify},{hangingIndent}
    FB(p) {
      fbWidth = int(p[0], 0);
      fbLines = int(p[1], 1);
      fbSpacing = int(p[2], 0);
      const fbJ = (p[3] ?? "L").toUpperCase();
      fbJustify = fbJ === "C" || fbJ === "R" || fbJ === "J" ? fbJ : "L";
      // ^FB also implies text if no ^A was specified
      if (!fieldType) {
        fieldType = "text";
        textH = cfHeight || 30;
        textW = cfWidth || 0;
        textRot = fwRotation;
      }
    },

    // ── Barcode defaults ────────────────────────────────────────────────────
    // ^BY{module_width},{ratio},{height}
    BY(p) {
      byModuleWidth = int(p[0], 2);
      byHeight = int(p[2], 0);
    },

    // ── Barcodes ────────────────────────────────────────────────────────────
    // ^BCN,{height},{interp},N,{check}
    BC(p) {
      fieldType = "code128";
      bcHeight = int(p[1], byHeight || 100);
      bcInterp = (p[2] ?? "Y") === "Y";
      bcCheck = (p[4] ?? "N") === "Y";
    },
    // ^B3N,{check},{height},{interp},N
    B3(p) {
      fieldType = "code39";
      bcCheck = (p[1] ?? "N") === "Y";
      bcHeight = int(p[2], byHeight || 100);
      bcInterp = (p[3] ?? "Y") === "Y";
    },
    // ^BEN,{height},{interp},N
    BE(p) {
      fieldType = "ean13";
      bcHeight = int(p[1], byHeight || 100);
      bcInterp = (p[2] ?? "Y") === "Y";
    },
    // ^BQN,2,{magnification}
    BQ(p) {
      fieldType = "qrcode";
      qrMag = int(p[2], 4);
    },
    // ^BXN,{dimension},{quality}
    BX(p) {
      fieldType = "datamatrix";
      dmDim = int(p[1], 5);
      dmQuality = int(p[2], 200) as DataMatrixProps["quality"];
    },
    // ^BUN,{height},{interp},N,N — UPC-A
    BU(p) {
      fieldType = "upca";
      bcHeight = int(p[1], byHeight || 100);
      bcInterp = (p[2] ?? "Y") === "Y";
    },
    // ^B8N,{height},{interp},N — EAN-8
    B8(p) {
      fieldType = "ean8";
      bcHeight = int(p[1], byHeight || 100);
      bcInterp = (p[2] ?? "Y") === "Y";
    },
    // ^B9N,{height},{interp},N — UPC-E
    B9(p) {
      fieldType = "upce";
      bcHeight = int(p[1], byHeight || 100);
      bcInterp = (p[2] ?? "Y") === "Y";
    },
    // ^B2N,{height},{interp},N,{check} — Interleaved 2 of 5
    B2(p) {
      fieldType = "interleaved2of5";
      bcHeight = int(p[1], byHeight || 100);
      bcInterp = (p[2] ?? "Y") === "Y";
      bcCheck = (p[4] ?? "N") === "Y";
    },
    // ^BAN,{height},{interp},N,{check} — Code 93
    BA(p) {
      fieldType = "code93";
      bcHeight = int(p[1], byHeight || 100);
      bcInterp = (p[2] ?? "Y") === "Y";
      bcCheck = (p[4] ?? "N") === "Y";
    },
    // ^B7N,{rowHeight},{securityLevel},{columns},,, — PDF417
    B7(p) {
      fieldType = "pdf417";
      pdfRowHeight = int(p[1], 10);
      pdfSecurity = int(p[2], 0);
      pdfColumns = int(p[3], 0);
    },
    // ^B1N,{check},{height},{interp},N — Code 11
    B1(p) {
      fieldType = "code11";
      bcCheck = (p[1] ?? "N") === "Y";
      bcHeight = int(p[2], byHeight || 100);
      bcInterp = (p[3] ?? "Y") === "Y";
    },
    // ^BIN,{height},{interp},N — Industrial 2 of 5
    BI(p) {
      fieldType = "industrial2of5";
      bcHeight = int(p[1], byHeight || 100);
      bcInterp = (p[2] ?? "Y") === "Y";
    },
    // ^BJN,{height},{interp},N — Standard 2 of 5
    BJ(p) {
      fieldType = "standard2of5";
      bcHeight = int(p[1], byHeight || 100);
      bcInterp = (p[2] ?? "Y") === "Y";
    },
    // ^BKN,{check},{height},{interp},N — ANSI Codabar
    BK(p) {
      fieldType = "codabar";
      bcCheck = (p[1] ?? "N") === "Y";
      bcHeight = int(p[2], byHeight || 100);
      bcInterp = (p[3] ?? "Y") === "Y";
    },
    // ^BLN,{height},{interp} — LOGMARS
    BL(p) {
      fieldType = "logmars";
      bcHeight = int(p[1], byHeight || 100);
      bcInterp = (p[2] ?? "N") === "Y";
    },
    // ^BMN,{checkType},{height},{interp},N — MSI
    // checkType: A=Mod10, B=Mod11, C=Mod10+Mod10, D=Mod11+Mod10, N=none
    BM(p) {
      fieldType = "msi";
      bcCheck = (p[1] ?? "N") !== "N";
      bcHeight = int(p[2], byHeight || 100);
      bcInterp = (p[3] ?? "Y") === "Y";
    },
    // ^BPN,{check},{height},{interp},N — Plessey
    BP(p) {
      fieldType = "plessey";
      bcCheck = (p[1] ?? "N") === "Y";
      bcHeight = int(p[2], byHeight || 100);
      bcInterp = (p[3] ?? "Y") === "Y";
    },
    // ^BRN,{symbology},{magnification},{separator},{height},{segments} — GS1 Databar
    BR(p) {
      fieldType = "gs1databar";
      bcHeight = int(p[4], byHeight || 100);
      byModuleWidth = int(p[2], byModuleWidth);
    },
    // ^B5N,{height},{interp},N — Planet Code
    B5(p) {
      fieldType = "planet";
      bcHeight = int(p[1], byHeight || 100);
      bcInterp = (p[2] ?? "Y") === "Y";
    },
    // ^BZN,{height},{interp},N — POSTAL / POSTNET
    BZ(p) {
      fieldType = "postal";
      bcHeight = int(p[1], byHeight || 100);
      bcInterp = (p[2] ?? "Y") === "Y";
    },
    // ^B0N,{magnification},... / ^BON,... — Aztec (^B0 and ^BO are synonyms)
    B0: handleAztec,
    BO: handleAztec,
    // ^BFN,{rowHeight} — MicroPDF417
    BF(p) {
      fieldType = "micropdf417";
      mpdfRowHeight = int(p[1], 10);
    },
    // ^BBN,{rowHeight},{security},{numCharsPerRow},{numRows},{mode} — CODABLOCK
    BB(p) {
      fieldType = "codablock";
      cbRowHeight = int(p[1], 10);
      cbSecurity = (p[2] ?? "Y") === "N" ? "N" : "Y";
    },

    // ── Field hex indicator ─────────────────────────────────────────────────
    FH(_, rest) {
      fhActive = true;
      fhDelimiter = rest[0] ?? "_";
    },

    // ── Field data / separator ──────────────────────────────────────────────
    FD(_, rest) {
      // Implicit text field: ^FD without a prior ^A uses ^CF defaults
      if (!fieldType) {
        fieldType = "text";
        textH = cfHeight || 30;
        textW = cfWidth || 0;
        textRot = fwRotation;
      }
      pendingFD = rest;
    },
    FS() {
      flushField();
      fhActive = false;
      positionIsFT = false;
    },

    // ── Serialization ───────────────────────────────────────────────────────
    SN(p) {
      // ^SN{start},{increment},{leadZero}
      // Appears AFTER the ^FD for this field — upgrade the last text object to serial
      const snStart = p[0] ?? "";
      const snInc = int(p[1], 1);
      const lastObj = objects[objects.length - 1];
      if (lastObj && lastObj.type === "text") {
        const tp = lastObj.props as unknown as Record<string, unknown>;
        const serialObj = makeObj(
          "serial",
          lastObj.x,
          lastObj.y,
          {
            content: snStart || (tp["content"] as string) || "001",
            increment: snInc,
            fontHeight: (tp["fontHeight"] as number) ?? 30,
            fontWidth: (tp["fontWidth"] as number) ?? 0,
            rotation: (tp["rotation"] as SerialProps["rotation"]) ?? "N",
            zplMode: "SN",
          } satisfies SerialProps,
          lastObj.positionType,
          lastObj.comment,
        );
        objects[objects.length - 1] = serialObj;
      }
    },
    SF(p) {
      // ^SF{increment},{padDigits},{leadZero}
      // Appears BEFORE ^FD — set pending state so flushField creates serial
      snPending = true;
      snIncrement = int(p[0], 1);
      snMode = "SF";
    },

    // ── Label reverse / field reverse ───────────────────────────────────────
    LR(_, rest) { lrActive = rest.toUpperCase().startsWith("Y"); },
    FR() { frActive = true; },

    // ── Label home (origin offset) ──────────────────────────────────────────
    LH(p) {
      lhX = int(p[0], 0);
      lhY = int(p[1], 0);
    },

    // ── Label top (vertical offset) ─────────────────────────────────────────
    LT(_, rest) { ltY = int(rest, 0); },

    // ── Graphics ────────────────────────────────────────────────────────────
    GB(p) {
      // ^GB{w},{h},{t},{color},{rounding}
      // ZPL: w=0 or h=0 means "use thickness value" for that dimension
      const t = int(p[2], 3);
      const rawW = int(p[0], t);
      const rawH = int(p[1], t);
      const w = rawW === 0 ? t : rawW;
      const h = rawH === 0 ? t : rawH;
      const color = (p[3] ?? "B") as "B" | "W";
      const rounding = int(p[4], 0);
      const gbComment = takeComment();

      // Distinguish line from box: a line has one dimension equal to thickness
      if (h === t && w > t) {
        objects.push(
          makeObj(
            "line",
            x,
            y,
            {
              angle: 0,
              length: w,
              thickness: t,
              color,
              reverse: lrActive || frActive || undefined,
            } satisfies LineProps,
            undefined,
            gbComment,
          ),
        );
      } else if (w === t && h > t) {
        objects.push(
          makeObj(
            "line",
            x,
            y,
            {
              angle: 90,
              length: h,
              thickness: t,
              color,
              reverse: lrActive || frActive || undefined,
            } satisfies LineProps,
            undefined,
            gbComment,
          ),
        );
      } else {
        const filled = t >= Math.min(w, h);
        objects.push(
          makeObj(
            "box",
            x,
            y,
            {
              width: w,
              height: h,
              thickness: filled ? 3 : t,
              filled,
              color,
              rounding,
              reverse: lrActive || frActive || undefined,
            } satisfies BoxProps,
            undefined,
            gbComment,
          ),
        );
      }
    },
    GD(p) {
      // ^GD{w},{h},{t},{color},{orientation}
      // orientation: L = top-left→bottom-right, R = top-right→bottom-left
      const gdW = int(p[0], 1);
      const gdH = int(p[1], 1);
      const gdT = int(p[2], 3);
      const gdColor = (p[3] ?? "B") as "B" | "W";
      const gdOri = (p[4] ?? "L").toUpperCase();
      const gdLen = Math.round(Math.sqrt(gdW * gdW + gdH * gdH));
      // Recover start point and angle from bounding-box FO position
      // 'L': dx>0,dy>0 → obj.x=boxX, angle=atan2(h,w)
      // 'R': dx<0,dy>0 → obj.x=boxX+w, angle=atan2(h,-w)
      const gdObjX = gdOri === "R" ? x + gdW : x;
      const gdAngle = Math.round(
        gdOri === "R"
          ? (Math.atan2(gdH, -gdW) * 180) / Math.PI
          : (Math.atan2(gdH, gdW) * 180) / Math.PI,
      );
      objects.push(
        makeObj(
          "line",
          gdObjX,
          y,
          {
            angle: gdAngle,
            length: gdLen,
            thickness: gdT,
            color: gdColor,
            reverse: lrActive || frActive || undefined,
          } satisfies LineProps,
          undefined,
          takeComment(),
        ),
      );
    },
    GF(_, rest) {
      // ^GFA,{totalBytes},{totalBytes},{bytesPerRow},{compressedOrHexData}
      const format = rest[0]?.toUpperCase();
      if (format !== "A") {
        // Non-A formats (binary, compressed) can't be rendered in the browser
        skipped.push(`^GF${rest}`);
        browserLimit.push(`^GF${rest}`);
        return;
      }

      // Extract params: skip "A," then find 3rd comma to separate params from data
      const gfRest = rest.slice(2); // "total,total,bytesPerRow,data..."
      let commaPos = -1;
      for (let n = 0; n < 3; n++) {
        commaPos = gfRest.indexOf(",", commaPos + 1);
        if (commaPos === -1) break;
      }
      if (commaPos === -1) {
        skipped.push(`^GF${rest}`);
        return;
      }

      const gfParams = gfRest.slice(0, commaPos).split(",");
      const gfBytesPerRow = int(gfParams[2], 0);
      // Everything after the 3rd comma is the (possibly compressed) graphic data
      const gfRawData = gfRest.slice(commaPos + 1);

      if (gfBytesPerRow <= 0) {
        skipped.push(`^GF${rest}`);
        return;
      }

      // Decompress ZPL Alternative Data Compression for ^GFA
      const gfHex = decompressGFA(gfRawData, gfBytesPerRow);
      const gfWidthDots = gfBytesPerRow * 8;
      const gfTotalBytes = gfHex.length / 2;
      const gfHeightDots = Math.floor(gfTotalBytes / gfBytesPerRow);

      if (gfHeightDots <= 0) {
        skipped.push(`^GF${rest}`);
        return;
      }

      // Convert hex → 1-bit bitmap → canvas → data URL
      const canvas = document.createElement("canvas");
      canvas.width = gfWidthDots;
      canvas.height = gfHeightDots;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get 2d context");
      const imgData = ctx.createImageData(gfWidthDots, gfHeightDots);
      const pixels = imgData.data;

      for (let row = 0; row < gfHeightDots; row++) {
        for (let byteIdx = 0; byteIdx < gfBytesPerRow; byteIdx++) {
          const hexOffset = (row * gfBytesPerRow + byteIdx) * 2;
          const byte =
            parseInt(gfHex.slice(hexOffset, hexOffset + 2), 16) || 0;
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
      const dataUrl = canvas.toDataURL("image/png");
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

      const posType: "FT" | "FO" = positionIsFT ? "FT" : "FO";
      objects.push(
        makeObj(
          "image",
          x,
          y,
          {
            imageId,
            widthDots: gfWidthDots,
            threshold: 128,
            _gfaCache: gfaCache,
          } satisfies ImageProps,
          posType,
          takeComment(),
        ),
      );
    },
    GE(p) {
      // ^GE{w},{h},{t},{color}
      const w = int(p[0], 100);
      const h = int(p[1], 100);
      const t = int(p[2], 3);
      const color = (p[3] ?? "B") as "B" | "W";
      const filled = t >= Math.min(w, h);
      objects.push(
        makeObj(
          "ellipse",
          x,
          y,
          {
            width: w,
            height: h,
            thickness: filled ? 3 : t,
            filled,
            color,
          } satisfies EllipseProps,
          undefined,
          takeComment(),
        ),
      );
    },
    GC(p) {
      // ^GC{diameter},{thickness},{color}  → circle = ellipse with equal w/h
      const d = int(p[0], 100);
      const t = int(p[1], 3);
      const color = (p[2] ?? "B") as "B" | "W";
      const filled = t >= d;
      objects.push(
        makeObj(
          "ellipse",
          x,
          y,
          {
            width: d,
            height: d,
            thickness: filled ? 3 : t,
            filled,
            color,
          } satisfies EllipseProps,
          undefined,
          takeComment(),
        ),
      );
    },

    // ── Label print settings ────────────────────────────────────────────────
    PQ(p) {
      const qty = int(p[0], 0);
      if (qty > 0) labelConfig.printQuantity = qty;
    },
    MM(_, rest) {
      const mode = (rest[0] ?? "").toUpperCase() as LabelConfig["mediaMode"];
      if (mode) labelConfig.mediaMode = mode;
    },
    LS(_, rest) {
      const shift = int(rest, 0);
      if (shift !== 0) labelConfig.labelShift = shift;
    },

    // ── Browser-limit: printer-specific features ────────────────────────────
    CW: mkBrowserLimit("CW"), // font identifier — assigns alias to printer-resident font
    FL: mkBrowserLimit("FL"), // font link — links fonts on printer storage
    HT: mkBrowserLimit("HT"), // head test — diagnostic for print head
    LF: mkBrowserLimit("LF"), // list fonts — queries printer for installed fonts
    GS: mkBrowserLimit("GS"), // graphic symbol — references printer-internal symbols
    IM: mkBrowserLimit("IM"), // image reference — references image stored on printer
    DG: mkBrowserLimit("DG", "~"), // ~DG stores a graphic on the printer (tilde prefix)

    // ── TrueType font / text block ──────────────────────────────────────────
    // ^A@{rotation},{height},{width},{drive}:{font} — TrueType font reference
    // Can't load printer TrueType fonts; import as text with best-effort sizing
    "A@"(p, rest) {
      fieldType = "text";
      textRot = (rest[0] as TextProps["rotation"]) ?? fwRotation;
      textH = int(p[1]) || cfHeight || 30;
      textW = int(p[2]) || cfWidth || 0;
      const fontRef = p[3] ?? "";
      const colonIdx = fontRef.indexOf(":");
      pendingPrinterFontName =
        (colonIdx >= 0 ? fontRef.slice(colonIdx + 1) : fontRef) || undefined;
      partialCmds.add("^A@");
    },
    // ^TB{rotation},{width},{height} — text block (alternative to ^A + ^FB)
    TB(p, rest) {
      fieldType = "text";
      textRot = (rest[0] as TextProps["rotation"]) ?? fwRotation;
      const tbW = int(p[1], 0);
      const tbH = int(p[2], 0);
      textH = cfHeight || 30;
      textW = cfWidth || 0;
      if (tbW > 0) {
        fbWidth = tbW;
        fbLines = tbH > 0 ? Math.floor(tbH / (textH || 30)) : 1;
        fbJustify = "L";
      }
    },

    // ── Ignored / structural ────────────────────────────────────────────────
    // ^XA / ^XZ: label start/end — reset pending comment via empty rest
    XA: resetComment,
    XZ: resetComment,
    // ^FX: comment field — store for attachment to the next field object
    FX: resetComment,

    // These commands carry no canvas-design information and are silently
    // discarded so they do not pollute importReport.unknown.
    CI: noop, // character set encoding (^CI28 = UTF-8 is the browser default)
    FN: noop, // field number — variable data placeholder (template feature)
    FV: noop, // field variable — supplies data for ^FN at print time
    FC: noop, // field clock — inserts date/time (requires printer RTC)
    FE: noop, // field concatenation — appends data to current field
    FM: noop, // multiple field origin locations
    FP: noop, // field parameter — per-character text direction
    MT: noop, // media type
    MN: noop, // media handling / notch tracking
    JA: noop, // applicator / configuration recall
    JM: noop, // darkness / print settings
    JC: noop, // calibrate
    JD: noop, // disable head-cleaning
    JE: noop, // enable head-cleaning
    JI: noop, // initialize printer
    JR: noop, // restore factory defaults
    JS: noop, // change darkness
    JU: noop, // update firmware
    PR: noop, // print rate / speed
    PM: noop, // part of message
    PP: noop, // presentation position
  };

  // ── Main dispatch loop ─────────────────────────────────────────────────────
  for (const { cmd, rest } of tokens) {
    const p = rest.split(",");
    const handler = handlers[cmd];
    if (handler) {
      handler(p, rest);
      continue;
    }

    // ^A{font}{rotation},{height},{width} — general font command (A0 and A@ are in the map;
    // remaining ^A* variants are dynamic keys that cannot be static map entries).
    if (cmd[0] === "A" && cmd.length === 2) {
      fieldType = "text";
      textRot = (rest[0] as TextProps["rotation"]) ?? fwRotation;
      textH = int(p[1], cfHeight || 30);
      textW = int(p[2], cfWidth || 0);
      partialCmds.add(`^${cmd}`);
      continue;
    }

    // Record unknown commands (excluding pure whitespace tokens)
    if (rest.trim() || cmd.trim()) {
      const token = `^${cmd}${rest}`;
      skipped.push(token);
      unknown.push(token);
    }
  }

  return {
    labelConfig,
    objects,
    skipped,
    importReport: {
      partial: [...partialCmds],
      browserLimit,
      unknown,
    },
  };
}
