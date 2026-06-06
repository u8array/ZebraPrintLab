import type { LabelConfig } from "../../types/LabelConfig";
import type { LabelObject } from "../../types/Group";
import type { Variable } from "../../types/Variable";
import type { PrinterProfile } from "../../types/PrinterProfile";

export type ImportFindingKind = "partial" | "browserLimit" | "unknown";

/**
 * One import finding. Created per-occurrence so each entry can be navigated
 * to its source page in the UI; cross-block dedup happens (if at all) in the
 * service layer that merges per-page parser runs.
 */
export interface ImportFinding {
  kind: ImportFindingKind;
  /** Command token. For 'partial' the bare code (e.g. "^A@"); for
   *  'browserLimit' / 'unknown' the full token including parameters
   *  (e.g. "^IM,R:LOGO.GRF"). */
  command: string;
  /** Page index this finding originated from. The parser doesn't know about
   *  pages and emits 0; `zplImportService` overwrites it when it merges the
   *  per-block parser results into a multi-page report. */
  pageIndex: number;
}

export interface ImportReport {
  findings: ImportFinding[];
  /** Commands imported with known loss. Deduplicated by command code. */
  partial: string[];
  /** Commands skipped because they require printer hardware or file storage. */
  browserLimit: string[];
  /** Commands not recognised at all. */
  unknown: string[];
}

export interface ParsedZPL {
  labelConfig: Partial<LabelConfig>;
  /** EEPROM-persistent printer-state extracted from any Setup-Script
   *  commands in the stream (^JZ, ^JT, ~TA, ^ST, ^KD, ^SL, ^KL, ^SE,
   *  ^SZ, ^KN). Caller decides whether to merge into the active profile. */
  printerProfile: Partial<PrinterProfile>;
  objects: LabelObject[];
  /** Template variables reconstructed from `^FN` slots. */
  variables: Variable[];
  /** Commands not fully imported (browserLimit + unknown). Prefer
   *  importReport for categorised access. */
  skipped: string[];
  importReport: ImportReport;
}

export type Handler = (p: string[], rest: string, cmd: string) => void;

/** Pattern-matched handler entry: used when a command's key is
 *  variable (e.g. `^A{font}` with `{font}` ∈ 0..Z) so an exact-key
 *  table cannot express the dispatch. Each handler module owns its
 *  own wildcards and exports them alongside the exact-match table. */
export interface Wildcard {
  matches: (cmd: string) => boolean;
  handle: Handler;
}

/** Result of decoding any GF-shaped graphic into an image-cache entry. */
export interface DecodedGraphic {
  imageId: string;
  widthDots: number;
  heightDots: number;
  /** Verbatim `^GF{format},total,data,bpr,DATA` reconstruction kept on
   *  the image so round-trip emit can splice the same byte stream back
   *  into either `^GF` (inline) or `~DY` (preamble) without re-encoding. */
  gfaCache: string;
  crcOk: boolean;
}

/** Entry in the `~DY → ^XG` lookup map: a graphic uploaded earlier in the
 *  stream. Structurally a `DecodedGraphic` without the per-decode CRC flag;
 *  that lives on the partialCmds set instead of on every map entry. */
export type UploadedGraphic = Omit<DecodedGraphic, "crcOk">;
