export const QR_FO_Y_OFFSET_DOTS = 10;
export const QR_FT_MODULE_OFFSET = 3;

// Zebra/Labelary always reserves a mandatory text zone below EAN/UPC barcodes
// (even with printInterpretation=false). Verified at 8 and 12 dpmm: constant 13 dots.
export const EAN_TEXT_ZONE_DOTS = 13;

// bwip-js adds 3 quiet-zone rows to MicroPDF417 canvas output.
export const MICROPDF417_QUIET_ZONE_ROWS = 3;

export const EAN_UPC_TYPES = new Set<string>([
  "ean13",
  "ean8",
  "upca",
  "upce",
]);
