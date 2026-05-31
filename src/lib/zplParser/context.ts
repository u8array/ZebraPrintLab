import type { LabelObject } from "../../types/Group";
import type { LabelConfig } from "../../types/ObjectType";
import type { PrinterProfile } from "../../types/PrinterProfile";
import type { Variable } from "../../types/Variable";
import type { TextProps } from "../../registry/text";
import type { SerialProps } from "../../registry/serial";
import type { Code49Props } from "../../registry/code49";
import type { Gs1DatabarProps } from "../../registry/gs1databar";
import type { DataMatrixProps } from "../../registry/datamatrix";
import type { MaxicodeProps } from "../../registry/maxicode";
import type { CodablockProps } from "../../registry/codablock";
import type { ZplRotation } from "../../registry/rotation";
import { DEFAULT_CLOCK_CHARS, type ClockChars } from "../fcTemplate";
import { getDecoder } from "./helpers";
import type { UploadedGraphic } from "./types";

/** Pending ^GB stash for the reverse-text collapse heuristic. */
export interface PendingReverseBg {
  x: number;
  y: number;
  w: number;
  h: number;
  t: number;
  color: "B" | "W";
  rounding: number;
  reverseFlag: boolean | undefined;
  comment?: string;
}

/** Public output accumulators. Mutated by handlers (push to arrays,
 *  set fields on labelConfig / printerProfile); handed back to the
 *  caller verbatim via the returned `ParsedZPL`. */
export interface ParserResult {
  objects: LabelObject[];
  labelConfig: Partial<LabelConfig>;
  printerProfile: Partial<PrinterProfile>;
  variables: Variable[];
  skipped: string[];
  /** Deduplicated set of partial-import command codes. */
  partialCmds: Set<string>;
  browserLimit: string[];
  unknown: string[];
}

/** Label-frame state set by ^LH / ^LT / ^LR. Persists across all
 *  fields in the format until a later ^XA / ^LH / ^LT / ^LR overrides. */
export interface LabelFrameState {
  lhX: number;
  lhY: number;
  ltY: number;
  /** ^LR: label-wide reverse / invert. Per-field ^FR lives on the
   *  `field` slice because it resets at ^FS. */
  lrActive: boolean;
}

/** ^FX comment carry + ^FN slot machinery. `fnComment` snapshots the
 *  pending comment at ^FN time so a later ^FX that lands between ^FN
 *  and ^FS doesn't pollute the variable's auto-name. */
export interface CommentState {
  pending: string | undefined;
  fnNumber: number | null;
  fnComment: string | undefined;
}

/** Format-scoped (per-^XA) template + decoding state. Reset on
 *  ^XA / ^XZ to per-format defaults; ^FE / ^FC / ^FH / ^CI mutate. */
export interface FormatState {
  /** ^FE field-embed delimiter (default '#'). */
  embedChar: string;
  /** ^FC clock-token chars (date, time, tertiary). */
  clockChars: ClockChars;
  /** ^FH hex-decode mode flag. */
  fhActive: boolean;
  /** ^FH delimiter (default '_'). */
  fhDelimiter: string;
  /** ^CI-selected TextDecoder. Default UTF-8. */
  fhDecoder: TextDecoder;
}

/** Persistent defaults applied to following fields: ^CF default font,
 *  ^FW default rotation, ^FB field-block, ^BY barcode defaults.
 *  ^FB is the only group that resets after each text field (handled
 *  inside flushField); the others persist until overridden. */
export interface DefaultsState {
  cfHeight: number;
  cfWidth: number;
  cfFontId: string | undefined;
  fwRotation: TextProps["rotation"];
  fbWidth: number;
  fbLines: number;
  fbSpacing: number;
  fbJustify: TextProps["blockJustify"];
  /** 0 = no ^BY height; barcode handlers use `|| 100` as the sentinel. */
  byModuleWidth: number;
  byHeight: number;
}

/** ^CW alias map + ~DY upload tracking. Spans the whole parse so a
 *  ^CW in one ^XA block can still resolve a ^A{X} in the next. */
export interface FontsState {
  aliases: Map<string, string>;
  /** Paths seen via ~DY this stream; ^CW for the same path flips the
   *  mapping's `embedInZpl` flag (round-trip stability). */
  downloadedFontPaths: Set<string>;
  /** Graphics uploaded via ~DY, keyed by full `device:stem.ext` path.
   *  Recalled by ^XG into image objects. */
  downloadedGraphics: Map<string, UploadedGraphic>;
}

/** Per-field accumulator. Populated by handlers (^FO / ^FT for origin,
 *  ^A* for font and text params, ^B* for barcode params, ^GS for
 *  symbol params, etc.). Consumed and reset by flushField at ^FS. */
export interface FieldState {
  // Position (^FO / ^FT — pre-shift, before label.lh*/lt* offsets)
  x: number;
  y: number;
  positionIsFT: boolean;
  // Type discriminator + pending ^FD payload
  fieldType: string | null;
  pendingFD: string | null;
  /** ^FR: single-field reverse, reset on ^FS / new ^FO / ^FT. */
  frActive: boolean;
  // Text-field cached params
  textRot: TextProps["rotation"];
  textH: number;
  textW: number;
  // Barcode pending (set by ^B*, consumed by flushField)
  bcHeight: number;
  bcInterp: boolean;
  bcCheck: boolean;
  bcRotation: ZplRotation;
  bcCode49Mode: Code49Props["mode"];
  // ^GS symbol pending
  symRot: ZplRotation;
  symH: number;
  symW: number;
  // GS1 Databar pending
  gsSymbology: Gs1DatabarProps["symbology"];
  gsSegments: number | undefined;
  // 2D matrix pending
  qrMag: number;
  dmDim: number;
  dmQuality: DataMatrixProps["quality"];
  // Stacked-2D pending
  pdfRowHeight: number;
  pdfSecurity: number;
  pdfColumns: number;
  aztecMag: number;
  maxicodeMode: MaxicodeProps["mode"];
  mpdfRowHeight: number;
  cbRowHeight: number;
  cbSecurity: CodablockProps["securityLevel"];
  // Pending font reference (^A@ or ^A{id}) — mutually exclusive
  pendingPrinterFontName: string | undefined;
  pendingFontId: string | undefined;
  // ^SN / ^SF serialisation pending
  snPending: boolean;
  snIncrement: number;
  snMode: SerialProps["zplMode"];
}

/** All mutable parser state grouped into typed sub-slices. Each
 *  handler family can take only the slices it actually mutates, so
 *  the type system enforces ownership across families rather than
 *  every handler getting the whole god-object.
 *
 *  Narrowing heuristic for handler-family factories: pass individual
 *  slices when the family mutates ≤ 2 of them (barcodes →
 *  `field, defaults`; setupScript → `printerProfile`; labelConfig →
 *  `labelConfig`); pass `s` whole when the family touches ≥ 3 slices,
 *  because the long parameter list duplicates the ParserState
 *  interface without adding type-safety. Sub-slices still enforce
 *  ownership at the access path even when the whole `s` is passed —
 *  e.g. graphics needs `s.reverseBg` (top-level mutation) plus four
 *  other slices, so it takes `s` but the per-slice access path keeps
 *  the intent visible. */
export interface ParserState {
  result: ParserResult;
  label: LabelFrameState;
  comment: CommentState;
  format: FormatState;
  defaults: DefaultsState;
  fonts: FontsState;
  /** ^GB stash for the reverse-text collapse heuristic. Top-level
   *  field, not nested under `field` — parallel to `comment.fnNumber`
   *  it's a nullable "pending until next field consumes it" stash,
   *  but kept flat because there's only one such field at this level
   *  and grouping a single field into its own sub-slice would add
   *  ceremony without clarity. If a second cross-handler stash ever
   *  joins (e.g. a deferred font-load), promote to `pending: {...}`. */
  reverseBg: PendingReverseBg | null;
  field: FieldState;
}

/** Bbox tolerance for collapsing a stashed ^GB with a following ^FR
 *  text. Emit-time and parse-time inkWidth can drift by a dot or two
 *  depending on font registration; a small tolerance lets the
 *  legitimate pair collapse without over-collapsing coincidences. */
export const REVERSE_BBOX_TOLERANCE_DOTS = 2;

export function createParserState(): ParserState {
  return {
    result: {
      objects: [],
      labelConfig: {},
      printerProfile: {},
      variables: [],
      skipped: [],
      partialCmds: new Set<string>(),
      browserLimit: [],
      unknown: [],
    },
    label: {
      lhX: 0,
      lhY: 0,
      ltY: 0,
      lrActive: false,
    },
    comment: {
      pending: undefined,
      fnNumber: null,
      fnComment: undefined,
    },
    format: {
      embedChar: "#",
      clockChars: { ...DEFAULT_CLOCK_CHARS },
      fhActive: false,
      fhDelimiter: "_",
      fhDecoder: getDecoder("utf-8"),
    },
    defaults: {
      cfHeight: 0,
      cfWidth: 0,
      cfFontId: undefined,
      fwRotation: "N",
      fbWidth: 0,
      fbLines: 1,
      fbSpacing: 0,
      fbJustify: "L",
      byModuleWidth: 2,
      byHeight: 0,
    },
    fonts: {
      aliases: new Map<string, string>(),
      downloadedFontPaths: new Set<string>(),
      downloadedGraphics: new Map<string, UploadedGraphic>(),
    },
    reverseBg: null,
    field: {
      x: 0,
      y: 0,
      positionIsFT: false,
      fieldType: null,
      pendingFD: null,
      frActive: false,
      textRot: "N",
      textH: 30,
      textW: 0,
      bcHeight: 100,
      bcInterp: true,
      bcCheck: false,
      bcRotation: "N",
      bcCode49Mode: "A",
      symRot: "N",
      symH: 30,
      symW: 30,
      gsSymbology: 1,
      gsSegments: undefined,
      qrMag: 4,
      dmDim: 5,
      dmQuality: 200,
      pdfRowHeight: 10,
      pdfSecurity: 0,
      pdfColumns: 0,
      aztecMag: 4,
      maxicodeMode: 4,
      mpdfRowHeight: 10,
      cbRowHeight: 10,
      cbSecurity: "Y",
      pendingPrinterFontName: undefined,
      pendingFontId: undefined,
      snPending: false,
      snIncrement: 1,
      snMode: "SN",
    },
  };
}
