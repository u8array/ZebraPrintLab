import type { Code49Props } from "../../../registry/code49";
import type { DataMatrixProps } from "../../../registry/datamatrix";
import type { Gs1DatabarProps } from "../../../registry/gs1databar";
import type { MaxicodeProps } from "../../../registry/maxicode";
import { GS1_DATABAR_DEFAULT_SEGMENTS } from "../../gs1";
import type { DefaultsState, FieldState } from "../context";
import { int, readRotation } from "../helpers";
import type { Handler } from "../types";

/** ^B* barcode commands + shared ^BY defaults. Touches `field` and `defaults`. */
export function createBarcodeHandlers(
  field: FieldState,
  defaults: DefaultsState,
): Record<string, Handler> {
  // Factory for 1D barcodes: hIdx/iIdx/cIdx = param indices for height/interp/check.
  const mkBarcode =
    (
      type: string,
      hIdx: number,
      iIdx: number,
      iDefault = "Y",
      cIdx = -1,
    ): Handler =>
    (p) => {
      field.fieldType = type;
      field.bcRotation = readRotation(p[0]);
      field.bcHeight = int(p[hIdx], defaults.byHeight || 100);
      field.bcInterp = (p[iIdx] ?? iDefault) === "Y";
      if (cIdx >= 0) field.bcCheck = (p[cIdx] ?? "N") === "Y";
    };

  const handleAztec: Handler = (p) => {
    field.fieldType = "aztec";
    field.bcRotation = readRotation(p[0]);
    field.aztecMag = int(p[1], 4);
  };

  return {
    // ── Barcode defaults ──────────────────────────────────────────────────
    // ^BY{moduleWidth},{ratio},{height}
    BY(p) {
      defaults.byModuleWidth = int(p[0], 2);
      defaults.byHeight = int(p[2], 0);
    },

    // ── 1D barcodes via mkBarcode(type, hIdx, iIdx, iDefault?, cIdx?) ─────
    BC: mkBarcode("code128", 1, 2, "Y", 4), // ^BCN,h,i,N,c
    B3: mkBarcode("code39", 2, 3, "Y", 1), // ^B3N,c,h,i,N
    BE: mkBarcode("ean13", 1, 2), // ^BEN,h,i,N
    BU: mkBarcode("upca", 1, 2), // ^BUN,h,i,N,N
    B8: mkBarcode("ean8", 1, 2), // ^B8N,h,i,N
    B9: mkBarcode("upce", 1, 2), // ^B9N,h,i,N
    B2: mkBarcode("interleaved2of5", 1, 2, "Y", 4), // ^B2N,h,i,N,c
    BA: mkBarcode("code93", 1, 2, "Y", 4), // ^BAN,h,i,N,c
    B1: mkBarcode("code11", 2, 3, "Y", 1), // ^B1N,c,h,i,N
    BI: mkBarcode("industrial2of5", 1, 2), // ^BIN,h,i,N
    BJ: mkBarcode("standard2of5", 1, 2), // ^BJN,h,i,N
    BK: mkBarcode("codabar", 2, 3, "Y", 1), // ^BKN,c,h,i,N
    BL: mkBarcode("logmars", 1, 2, "N"), // ^BLN,h,i — interp default N
    BP: mkBarcode("plessey", 2, 3, "Y", 1), // ^BPN,c,h,i,N
    B5: mkBarcode("planet", 1, 2), // ^B5N,h,i,N
    BZ: mkBarcode("postal", 1, 2), // ^BZN,h,i,N
    BS: mkBarcode("upcEanExtension", 1, 2), // ^BSo,h,f (UPC/EAN supplement)

    // ^B4o,h,f,m — Code 49. Custom handler for the extra mode parameter.
    B4(p) {
      field.fieldType = "code49";
      field.bcRotation = readRotation(p[0]);
      field.bcHeight = int(p[1], defaults.byHeight || 20);
      field.bcInterp = (p[2] ?? "N") === "Y";
      const m = (p[3] ?? "A").toUpperCase();
      field.bcCode49Mode = /^[A0-5]$/.test(m)
        ? (m as Code49Props["mode"])
        : "A";
    },

    // MSI: check logic is "any letter except N" (not simple "Y") — keep inline.
    // ^BMN,{checkType},{height},{interp},N  (checkType: A/B/C/D=enabled, N=none)
    BM(p) {
      field.fieldType = "msi";
      field.bcRotation = readRotation(p[0]);
      field.bcCheck = (p[1] ?? "N") !== "N";
      field.bcHeight = int(p[2], defaults.byHeight || 100);
      field.bcInterp = (p[3] ?? "Y") === "Y";
    },

    // GS1 Databar: different param layout, also updates defaults.byModuleWidth.
    // ^BRo,{symbology},{magnification},{separator},{height},{segments}
    BR(p) {
      field.fieldType = "gs1databar";
      field.bcRotation = readRotation(p[0]);
      defaults.byModuleWidth = int(p[2], defaults.byModuleWidth);
      field.gsSymbology = (int(p[1], 1) as Gs1DatabarProps["symbology"]) || 1;
      field.gsSegments =
        p[5] !== undefined
          ? int(p[5], GS1_DATABAR_DEFAULT_SEGMENTS)
          : undefined;
    },

    // ^BQN,2,{magnification} — QR Code
    BQ(p) {
      field.fieldType = "qrcode";
      field.bcRotation = readRotation(p[0]);
      field.qrMag = int(p[2], 4);
    },

    // ^BXN,{dimension},{quality} — DataMatrix
    BX(p) {
      field.fieldType = "datamatrix";
      field.bcRotation = readRotation(p[0]);
      field.dmDim = int(p[1], 5);
      field.dmQuality = int(p[2], 200) as DataMatrixProps["quality"];
    },

    // ^B7N,{rowHeight},{securityLevel},{columns},,, — PDF417
    B7(p) {
      field.fieldType = "pdf417";
      field.bcRotation = readRotation(p[0]);
      field.pdfRowHeight = int(p[1], 10);
      field.pdfSecurity = int(p[2], 0);
      field.pdfColumns = int(p[3], 0);
    },

    // ^B0N,{magnification},... / ^BON,... — Aztec (^B0 and ^BO are synonyms)
    B0: handleAztec,
    BO: handleAztec,

    // ^BVo,{mode},{symbolNumber},{totalSymbols} — Maxicode (fixed
    // physical size, no magnification). symbolNumber/totalSymbols
    // describe structured-append composition; we don't expose that
    // in the editor, so the params are read but the emitted form
    // pins them to (1, 1).
    BV(p) {
      field.fieldType = "maxicode";
      field.bcRotation = readRotation(p[0]);
      const m = int(p[1], 4);
      field.maxicodeMode = (m >= 2 && m <= 6 ? m : 4) as MaxicodeProps["mode"];
    },

    // ^BFN,{rowHeight} — MicroPDF417
    BF(p) {
      field.fieldType = "micropdf417";
      field.bcRotation = readRotation(p[0]);
      field.mpdfRowHeight = int(p[1], 10);
    },

    // ^BBN,{rowHeight},{security},{numCharsPerRow},{numRows},{mode} — CODABLOCK
    BB(p) {
      field.fieldType = "codablock";
      field.bcRotation = readRotation(p[0]);
      field.cbRowHeight = int(p[1], 10);
      field.cbSecurity = (p[2] ?? "Y") === "N" ? "N" : "Y";
    },
  };
}
