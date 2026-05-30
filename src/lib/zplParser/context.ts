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

/** Pending ^GB stash for the reverse-text collapse heuristic. See the
 *  field comment on ParserState.pendingReverseBg for what triggers it. */
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

/** All mutable state the parser threads through its handlers. Held as
 *  a single object so the closure-soup of the old monolith becomes an
 *  explicit, typed surface — handler families take only the slice they
 *  mutate, and the inline parseZPL body reads / writes via `s.xxx`. */
export interface ParserState {
  // Result accumulators
  objects: LabelObject[];
  labelConfig: Partial<LabelConfig>;
  printerProfile: Partial<PrinterProfile>;
  variables: Variable[];
  // Findings sinks
  skipped: string[];
  partialCmds: Set<string>;
  browserLimit: string[];
  unknown: string[];
  // ^FX comment + ^FN template state
  pendingComment: string | undefined;
  pendingFn: number | null;
  pendingFnComment: string | undefined;
  // Field origin (^FO / ^FT) — pre-shift, before lhX/lhY/ltY offsets
  x: number;
  y: number;
  positionIsFT: boolean;
  // Pending field type + ^FD payload
  fieldType: string | null;
  pendingFD: string | null;
  // Cached per-field parameters
  textRot: TextProps["rotation"];
  textH: number;
  textW: number;
  bcHeight: number;
  bcInterp: boolean;
  bcCheck: boolean;
  bcRotation: ZplRotation;
  symRot: ZplRotation;
  symH: number;
  symW: number;
  bcCode49Mode: Code49Props["mode"];
  // ^FE / ^FC format-scoped template chars (persist through ^FS)
  embedChar: string;
  clockChars: ClockChars;
  // GS1 Databar pending
  gsSymbology: Gs1DatabarProps["symbology"];
  gsSegments: number | undefined;
  // ^BY barcode defaults
  byModuleWidth: number;
  byHeight: number;
  // 2D matrix code pending
  qrMag: number;
  dmDim: number;
  dmQuality: DataMatrixProps["quality"];
  // ^LR / ^FR reverse state
  lrActive: boolean;
  frActive: boolean;
  // ^GB + ^FR collapse stash (knockout-background → reverse-text pair)
  pendingReverseBg: PendingReverseBg | null;
  // ^LH / ^LT label offsets
  lhX: number;
  lhY: number;
  ltY: number;
  // ^CW alias→path map + ~DY upload tracking
  fontAliases: Map<string, string>;
  downloadedFontPaths: Set<string>;
  downloadedGraphics: Map<string, UploadedGraphic>;
  // ^FH / ^CI decoder state
  fhActive: boolean;
  fhDelimiter: string;
  fhDecoder: TextDecoder;
  // ^CF default font state
  cfHeight: number;
  cfWidth: number;
  cfFontId: string | undefined;
  // ^FW default field rotation
  fwRotation: TextProps["rotation"];
  // ^FB field block (applied to next text field then reset)
  fbWidth: number;
  fbLines: number;
  fbSpacing: number;
  fbJustify: TextProps["blockJustify"];
  // PDF417 pending
  pdfRowHeight: number;
  pdfSecurity: number;
  pdfColumns: number;
  // Aztec pending
  aztecMag: number;
  // Maxicode pending
  maxicodeMode: MaxicodeProps["mode"];
  // MicroPDF417 pending
  mpdfRowHeight: number;
  // CODABLOCK pending
  cbRowHeight: number;
  cbSecurity: CodablockProps["securityLevel"];
  // ^A@ / ^A{id} pending font references
  pendingPrinterFontName: string | undefined;
  pendingFontId: string | undefined;
  // ^SN / ^SF serialization
  snPending: boolean;
  snIncrement: number;
  snMode: SerialProps["zplMode"];
}

/** Bbox tolerance for collapsing a stashed ^GB with a following ^FR
 *  text. Emit-time and parse-time inkWidth can drift by a dot or two
 *  depending on font registration; a small tolerance lets the
 *  legitimate pair collapse without over-collapsing coincidences. */
export const REVERSE_BBOX_TOLERANCE_DOTS = 2;

export function createParserState(): ParserState {
  return {
    objects: [],
    labelConfig: {},
    printerProfile: {},
    variables: [],
    skipped: [],
    partialCmds: new Set<string>(),
    browserLimit: [],
    unknown: [],
    pendingComment: undefined,
    pendingFn: null,
    pendingFnComment: undefined,
    x: 0,
    y: 0,
    positionIsFT: false,
    fieldType: null,
    pendingFD: null,
    textRot: "N",
    textH: 30,
    textW: 0,
    bcHeight: 100,
    bcInterp: true,
    bcCheck: false,
    bcRotation: "N",
    symRot: "N",
    symH: 30,
    symW: 30,
    bcCode49Mode: "A",
    embedChar: "#",
    clockChars: { ...DEFAULT_CLOCK_CHARS },
    gsSymbology: 1,
    gsSegments: undefined,
    byModuleWidth: 2,
    byHeight: 0,
    qrMag: 4,
    dmDim: 5,
    dmQuality: 200,
    lrActive: false,
    frActive: false,
    pendingReverseBg: null,
    lhX: 0,
    lhY: 0,
    ltY: 0,
    fontAliases: new Map<string, string>(),
    downloadedFontPaths: new Set<string>(),
    downloadedGraphics: new Map<string, UploadedGraphic>(),
    fhActive: false,
    fhDelimiter: "_",
    fhDecoder: getDecoder("utf-8"),
    cfHeight: 0,
    cfWidth: 0,
    cfFontId: undefined,
    fwRotation: "N",
    fbWidth: 0,
    fbLines: 1,
    fbSpacing: 0,
    fbJustify: "L",
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
  };
}
