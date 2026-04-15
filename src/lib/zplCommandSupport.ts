/**
 * Machine-readable support matrix for ZPL II commands.
 *
 * Purpose: single source of truth for documentation, import-report
 * categorisation in the UI, and as a baseline for regression testing.
 * Keep in sync with zplParser.ts.
 */

/** Import fidelity when a ZPL command is parsed by this designer. */
export type ZplCommandStatus =
  | 'supported'      // Fully imported; no design information is lost
  | 'partial'        // Imported with known limitations (see ZplCommandInfo.loss)
  | 'structural'     // Carries no design content; correctly ignored (^XA, ^XZ, ^FX …)
  | 'browser-limit'  // Requires printer hardware / file storage; cannot be used in the browser
  | 'unsupported';   // Carries design information but not yet implemented

export interface ZplCommandInfo {
  /** 2-character ZPL command code, uppercase, without the leading ^ or ~ */
  cmd: string;
  /** Brief description of what this ZPL command does */
  description: string;
  /** Import fidelity status */
  status: ZplCommandStatus;
  /** What is lost or approximated when status is 'partial' or 'browser-limit' */
  loss?: string;
}

export const ZPL_COMMANDS: readonly ZplCommandInfo[] = [
  // ── Label layout ──────────────────────────────────────────────────────────
  { cmd: 'XA', status: 'structural', description: 'Start format (label start marker)' },
  { cmd: 'XZ', status: 'structural', description: 'End format / print label' },
  { cmd: 'PW', status: 'supported', description: 'Print width — sets label width in dots' },
  { cmd: 'LL', status: 'supported', description: 'Label length — sets label height in dots' },
  { cmd: 'LH', status: 'supported', description: 'Label home — global origin offset applied to all fields' },
  { cmd: 'LS', status: 'supported', description: 'Label shift — horizontal offset in dots' },
  { cmd: 'LT', status: 'supported', description: 'Label top — vertical offset applied to all field positions' },
  { cmd: 'PQ', status: 'supported', description: 'Print quantity' },
  { cmd: 'MM', status: 'supported', description: 'Media mode (T tear-off, V peel, D cutter, K kiosk)' },
  { cmd: 'MT', status: 'structural', description: 'Media type — printer hardware setting, not relevant for canvas design' },

  // ── Field positioning ─────────────────────────────────────────────────────
  { cmd: 'FO', status: 'supported', description: 'Field origin — absolute position from label home' },
  { cmd: 'FT', status: 'supported', description: 'Field top — position measured from top-left of label' },

  // ── Field data & modifiers ────────────────────────────────────────────────
  { cmd: 'FD', status: 'supported', description: 'Field data — content payload for the current field' },
  { cmd: 'FS', status: 'supported', description: 'Field separator — ends the current field' },
  { cmd: 'FH', status: 'supported', description: 'Field hex indicator — enables _XX hex-escape sequences in ^FD' },
  { cmd: 'FR', status: 'supported', description: 'Field reverse — inverts colours for this field only' },
  { cmd: 'FX', status: 'structural', description: 'Comment field — ignored' },
  { cmd: 'FW', status: 'supported', description: 'Field orientation — sets default rotation for subsequent fields' },
  { cmd: 'FB', status: 'supported', description: 'Field block — multi-line text with word-wrap and justification' },
  { cmd: 'FC', status: 'unsupported', description: 'Field clock — inserts date/time into field data' },
  { cmd: 'FE', status: 'unsupported', description: 'Field concatenation — appends data to the current field' },
  { cmd: 'FM', status: 'unsupported', description: 'Multiple field origin locations' },
  { cmd: 'FN', status: 'unsupported', description: 'Field number — variable field placeholder for recall/merge' },
  { cmd: 'FP', status: 'unsupported', description: 'Field parameter — sets character-by-character text direction' },
  { cmd: 'FV', status: 'unsupported', description: 'Field variable — supplies data for a ^FN field at print time' },

  // ── Fonts & text ──────────────────────────────────────────────────────────
  { cmd: 'A0', status: 'supported', description: 'Scalable/bitmap font 0 — primary designer font' },
  { cmd: 'CF', status: 'supported', description: 'Change default font — sets height/width for subsequent text fields' },
  {
    cmd: 'A@', status: 'partial',
    description: 'TrueType/OpenType font reference by device path',
    loss: 'Font face is not imported; text content and point size are preserved with best-effort sizing',
  },
  { cmd: 'TB', status: 'supported', description: 'Text block — alternative to ^A + ^FB for wrapped/justified text' },
  {
    cmd: 'CW', status: 'browser-limit',
    description: 'Font identifier — assigns a single-letter alias to a printer-resident font',
    loss: 'Cannot access printer font storage; alias is ignored but subsequent ^A references fall back to default font',
  },
  {
    cmd: 'FL', status: 'browser-limit',
    description: 'Font linking — links host fonts on the printer',
    loss: 'Requires printer font storage; not applicable in the browser',
  },
  {
    cmd: 'HT', status: 'browser-limit',
    description: 'Host linked font list — retrieves font data from printer',
    loss: 'Requires printer communication; not available in the browser',
  },
  {
    cmd: 'LF', status: 'browser-limit',
    description: 'List font links — retrieves linked font info from printer',
    loss: 'Requires printer communication; not available in the browser',
  },

  // ── Reverse / invert ──────────────────────────────────────────────────────
  { cmd: 'LR', status: 'supported', description: 'Label reverse — inverts colours for all subsequent fields' },

  // ── Barcodes ──────────────────────────────────────────────────────────────
  { cmd: 'BY', status: 'supported', description: 'Bar code field default — sets module width, ratio, height' },
  { cmd: 'B0', status: 'supported', description: 'Aztec barcode' },
  { cmd: 'B1', status: 'supported', description: 'Code 11 barcode' },
  { cmd: 'B2', status: 'supported', description: 'Interleaved 2 of 5 barcode' },
  { cmd: 'B3', status: 'supported', description: 'Code 39 barcode' },
  { cmd: 'B4', status: 'unsupported', description: 'Code 49 barcode' },
  { cmd: 'B5', status: 'supported', description: 'Planet Code barcode' },
  { cmd: 'B7', status: 'supported', description: 'PDF417 barcode' },
  { cmd: 'B8', status: 'supported', description: 'EAN-8 barcode' },
  { cmd: 'B9', status: 'supported', description: 'UPC-E barcode' },
  { cmd: 'BA', status: 'supported', description: 'Code 93 barcode' },
  { cmd: 'BB', status: 'supported', description: 'CODABLOCK barcode' },
  { cmd: 'BC', status: 'supported', description: 'Code 128 barcode' },
  { cmd: 'BD', status: 'unsupported', description: 'UPS MaxiCode barcode' },
  { cmd: 'BE', status: 'supported', description: 'EAN-13 barcode' },
  { cmd: 'BF', status: 'supported', description: 'MicroPDF417 barcode' },
  { cmd: 'BI', status: 'supported', description: 'Industrial 2 of 5 barcode' },
  { cmd: 'BJ', status: 'supported', description: 'Standard 2 of 5 barcode' },
  { cmd: 'BK', status: 'supported', description: 'ANSI Codabar barcode' },
  { cmd: 'BL', status: 'supported', description: 'LOGMARS barcode' },
  { cmd: 'BM', status: 'supported', description: 'MSI barcode' },
  { cmd: 'BO', status: 'supported', description: 'Aztec barcode (alternate)' },
  { cmd: 'BP', status: 'supported', description: 'Plessey barcode' },
  { cmd: 'BQ', status: 'supported', description: 'QR Code' },
  { cmd: 'BR', status: 'supported', description: 'GS1 Databar' },
  { cmd: 'BS', status: 'unsupported', description: 'UPC/EAN extensions' },
  { cmd: 'BT', status: 'unsupported', description: 'TLC39 barcode' },
  { cmd: 'BU', status: 'supported', description: 'UPC-A barcode' },
  { cmd: 'BX', status: 'supported', description: 'DataMatrix code' },
  { cmd: 'BZ', status: 'supported', description: 'POSTAL barcode' },

  // ── Graphics ──────────────────────────────────────────────────────────────
  { cmd: 'GB', status: 'supported', description: 'Graphic box — also interpreted as a line when one dimension equals thickness' },
  { cmd: 'GD', status: 'supported', description: 'Graphic diagonal line' },
  { cmd: 'GE', status: 'supported', description: 'Graphic ellipse' },
  { cmd: 'GC', status: 'supported', description: 'Graphic circle (mapped to ellipse with equal width/height)' },
  {
    cmd: 'GF', status: 'partial',
    description: 'Graphic field — embedded monochrome bitmap',
    loss: 'Only ^GFA (hex / ZPL-compressed format) is supported; ^GFB and ^GFC formats are skipped',
  },
  {
    cmd: 'GS', status: 'browser-limit',
    description: 'Graphic symbol — prints a printer-resident symbol character',
    loss: 'Symbols are stored on the printer; cannot be rendered in the browser',
  },

  // ── Serialisation ─────────────────────────────────────────────────────────
  { cmd: 'SN', status: 'supported', description: 'Serialisation data (post-field counter — ^SN appears after ^FD)' },
  { cmd: 'SF', status: 'supported', description: 'Serialize field (pre-field counter — ^SF appears before ^FD)' },

  // ── Encoding ──────────────────────────────────────────────────────────────
  { cmd: 'CI', status: 'structural', description: 'Change international font/encoding — not required; UTF-8 is used natively in the browser' },

  // ── Control & media ───────────────────────────────────────────────────────
  { cmd: 'MC', status: 'structural', description: 'Map clear — clears the bitmap buffer before building the label' },
  { cmd: 'MD', status: 'structural', description: 'Media darkness — printer hardware setting' },
  { cmd: 'ML', status: 'structural', description: 'Maximum label length — printer calibration value' },
  { cmd: 'MN', status: 'structural', description: 'Media tracking — continuous/gap/mark sensing (hardware)' },

  // ── Print control ─────────────────────────────────────────────────────────
  { cmd: 'PF', status: 'structural', description: 'Slew given number of dot rows — printer movement command' },
  { cmd: 'PH', status: 'structural', description: 'Slew to home position — printer movement command' },
  { cmd: 'PM', status: 'structural', description: 'Print mirror image — hardware mirror setting' },
  { cmd: 'PO', status: 'structural', description: 'Print orientation — sets label print orientation on printer' },
  { cmd: 'PP', status: 'structural', description: 'Programmable pause — pauses after each label (hardware)' },
  { cmd: 'PR', status: 'structural', description: 'Print rate — sets print speed (hardware)' },
  { cmd: 'PS', status: 'structural', description: 'Print start — resumes printing after a pause (hardware)' },

  // ── Printer storage & resources ───────────────────────────────────────────
  {
    cmd: 'IM', status: 'browser-limit',
    description: 'Image recall from printer memory',
    loss: 'Cannot access printer file storage from a browser; the field is skipped entirely',
  },
  {
    cmd: 'DG', status: 'browser-limit',
    description: 'Download graphic to printer storage (~DG)',
    loss: 'Stores data on the physical printer; not relevant for canvas label design',
  },
] as const;

/** O(1) lookup map: command code → info */
export const ZPL_COMMAND_MAP: ReadonlyMap<string, ZplCommandInfo> =
  new Map(ZPL_COMMANDS.map((c) => [c.cmd, c]));

/**
 * Returns the import status for a ZPL command token (2 uppercase chars).
 * Handles the special case of general ^A{x} bitmap-font commands.
 */
export function getCommandStatus(cmd: string): ZplCommandStatus {
  const upper = cmd.toUpperCase();
  const entry = ZPL_COMMAND_MAP.get(upper);
  if (entry) return entry.status;
  // General ^A{font}{rotation} commands (A1–A9, AA–AZ except A0 which is explicit) — best-effort text
  if (upper.length === 2 && upper[0] === 'A') return 'partial';
  return 'unsupported';
}
