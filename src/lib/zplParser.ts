import type { CustomFontMapping, LabelConfig } from "../types/ObjectType";
import {
  FN_NUMBER_MIN,
  FN_NUMBER_MAX,
  uniqueVariableName,
  type Variable,
} from "../types/Variable";
import { zplAnchorToModel } from "../components/Canvas/textPositionTransforms";
import { computeTextRenderMetrics } from "../components/Canvas/textRenderMetrics";
import type { LabelObject } from "../types/Group";
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
import type { Gs1DatabarProps } from "../registry/gs1databar";
import type { Pdf417Props } from "../registry/pdf417";
import type { Code49Props } from "../registry/code49";
import type { SerialProps } from "../registry/serial";
import { isZplRotation, type ZplRotation } from "../registry/rotation";
import type { AztecProps } from "../registry/aztec";
import type { MicroPdf417Props } from "../registry/micropdf417";
import type { CodablockProps } from "../registry/codablock";
import { unzlibSync } from "fflate";
import { putImage } from "./imageCache";
import { formatStoragePath, parseStoragePath } from "./storagePath";
import { loadFontBytesSync } from "./fontCache";
import { ZPL_BUILTIN_FONT_LETTERS } from "./customFonts";
import { GS1_DATABAR_DEFAULT_SEGMENTS } from "./gs1";

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
   *  (e.g. "^IM,R:LOGO.GRF"). Matches the pre-finding-restructure
   *  format so existing UI / format helpers keep working. */
  command: string;
  /** Page index this finding originated from. The parser doesn't know about
   *  pages and emits 0; `zplImportService` overwrites it when it merges the
   *  per-block parser results into a multi-page report. */
  pageIndex: number;
}

/**
 * Categorised import report produced alongside the parsed objects.
 * `findings` is the source of truth; the three string buckets are derived
 * views kept for backward compatibility with existing parser tests and
 * the textual report formatter.
 */
export interface ImportReport {
  /** Per-block findings grouped by kind (partial, then browserLimit, then
   *  unknown). Inside each group, entries are in encounter order; the
   *  partial group is deduplicated by command code. The derived arrays
   *  below offer a kind-filtered view. */
  findings: ImportFinding[];
  /** Commands that were imported with known loss (e.g. ^A@ → font face not available in browser).
   *  An object WAS created; something about it is approximate. Deduplicated by command code. */
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
  /** Template variables reconstructed from `^FN` slots. The parser creates
   *  one entry per distinct fnNumber it sees and points every bound
   *  object's `variableId` at the matching entry. Empty when no `^FN`
   *  appeared in the block. */
  variables: Variable[];
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

/** Derive a Variable name from a `^FX` comment that landed just before the
 *  `^FN`. Strips well-known annotation prefixes (`Field:`, `Variable:`,
 *  `Var:`) so a comment like "Field: Customer Name" becomes `Customer_Name`.
 *  Returns null when the comment is missing or sanitises to empty — the
 *  caller falls back to `field_{n}`. */
function variableNameFromComment(comment: string | undefined): string | null {
  if (!comment) return null;
  const cleaned = comment
    .replace(/^\s*(field|variable|var)\s*[:-]\s*/i, "")
    .trim()
    .replace(/\s+/g, "_");
  return cleaned === "" ? null : cleaned;
}


/**
 * Map a ^CI N parameter to a TextDecoder label. Most labels printed by this
 * app use ^CI28 (UTF-8); ^CI27 is Windows-1252 (Zebra default for many EU
 * setups); legacy ^CI0..13 are 7-bit-ASCII-compatible code-page variants for
 * which Windows-1252 is a safe superset for the purposes of `^FH` decoding.
 * Unsupported encodings (multi-byte UTF-16/32 variants, code page 850, …)
 * fall back to UTF-8 with the command surfaced via importReport.partial.
 */
function ciToEncoding(n: number): { label: string; supported: boolean } {
  if (n === 28) return { label: "utf-8", supported: true };
  if (n === 27) return { label: "windows-1252", supported: true };
  if (n >= 0 && n <= 13) return { label: "windows-1252", supported: true };
  return { label: "utf-8", supported: false };
}

const decoderCache = new Map<string, TextDecoder>();
function getDecoder(label: string): TextDecoder {
  let dec = decoderCache.get(label);
  if (!dec) {
    dec = new TextDecoder(label);
    decoderCache.set(label, dec);
  }
  return dec;
}

/**
 * Decode ^FH hex escapes: replaces runs of {delimiter}XX with the string for
 * the byte sequence XX XX … under the active ^CI encoding. A single non-ASCII
 * glyph may span multiple escape pairs (e.g. `_C3_A4` → `ä` under UTF-8), so
 * we collect contiguous pairs into a Uint8Array and run one TextDecoder pass
 * per run. Invalid byte sequences become U+FFFD (decoder default).
 */
function decodeFH(
  text: string,
  delimiter: string,
  decoder: TextDecoder,
): string {
  const escaped = delimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const runRe = new RegExp(`(?:${escaped}[0-9A-Fa-f]{2})+`, "g");
  const stride = delimiter.length + 2;
  return text.replace(runRe, (run) => {
    const bytes = new Uint8Array(run.length / stride);
    for (let i = 0, b = 0; i < run.length; i += stride, b++) {
      bytes[b] = parseInt(run.slice(i + delimiter.length, i + stride), 16);
    }
    return decoder.decode(bytes);
  });
}

/** Characters of a `^GF`/`~DY` payload retained in browserLimit/skipped
 *  findings; rest is replaced with an ellipsis so a single multi-KB
 *  base64 blob doesn't drown out the import report. */
const IMPORT_FINDING_PAYLOAD_LIMIT = 80;

const CRC16_POLY = 0x1021;
const CRC16_MSB_MASK = 0x8000; // 1 << 15
const CRC16_MASK = 0xffff;
const BITS_PER_BYTE = 8;

/**
 * CRC-16/XMODEM (poly 0x1021, init 0x0000, no reflect, no xorout) —
 * Zebra's ZB64/ZB16 wrapper uses this variant. Computed over the base64
 * (or hex) payload between the `:B64:`/`:Z64:` prefix and the trailing
 * `:CRC` suffix. (Note: this is *not* CRC-16/CCITT-FALSE, which uses
 * init=0xFFFF — empirically verified against Labelary: payloads with the
 * XMODEM CRC are accepted, CCITT-FALSE CRC is rejected.)
 */
function crc16Xmodem(s: string): number {
  let crc = 0;
  for (const ch of s) {
    crc ^= ch.charCodeAt(0) << BITS_PER_BYTE;
    for (let j = 0; j < BITS_PER_BYTE; j++) {
      crc = (crc & CRC16_MSB_MASK)
        ? ((crc << 1) ^ CRC16_POLY) & CRC16_MASK
        : (crc << 1) & CRC16_MASK;
    }
  }
  return crc;
}

type GfWrapperKind = "b64" | "z64";

interface GfWrapperDecoded {
  kind: GfWrapperKind;
  /** Raw decoded bytes — for `:Z64:` this is still zlib-compressed. */
  bytes: Uint8Array;
  /** True if the trailing CRC matches the base64 payload. */
  crcOk: boolean;
}

/** CRC-16 emitted as 4 uppercase hex chars in the `:B64:`/`:Z64:` trailer. */
const CRC_HEX_DIGITS = 4;
// \s in the base64 char class tolerates the line-break-every-N-chars
// formatting that some ZPL generators apply to long ^GF payloads.
const GF_WRAPPER_RE = new RegExp(
  `^:(B64|Z64):([A-Za-z0-9+/=\\s]+):([0-9A-Fa-f]{${CRC_HEX_DIGITS}})$`,
);

/** Decode a base64 string to bytes; empty array on malformed input. */
function base64ToBytes(b64: string): Uint8Array {
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    return new Uint8Array(0);
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Parse a `:B64:<base64>:<crc>` or `:Z64:<base64>:<crc>` wrapper. Returns
 * null if the payload doesn't carry a wrapper. Used inside `^GFA`/`^GFB`/
 * `^GFC` where Zebra firmware accepts the same envelope. The CRC is
 * computed over the base64 string (CRC-16/XMODEM) and surfaced as a flag
 * rather than a hard reject — printers tolerate mismatches, and we'd
 * rather render a slightly-suspect graphic than silently drop it.
 *
 * `payload.trim()` because real-world ZPL is often line-broken between
 * commands; the tokenizer keeps the trailing newline on `rest`, and an
 * un-trimmed regex with a `$` anchor would miss every wrapper-in-the-wild.
 */
function parseGfWrapper(payload: string): GfWrapperDecoded | null {
  const m = GF_WRAPPER_RE.exec(payload.trim());
  if (!m) return null;
  // atob and the CRC both fail on embedded whitespace — strip after match
  // so the wrapper-form regex above can stay permissive for line-broken
  // payloads but the downstream decoders see pure base64.
  const b64 = (m[2] ?? "").replace(/\s/g, "");
  const declaredCrc = parseInt(m[3] ?? "0", 16);
  return {
    kind: (m[1] ?? "").toLowerCase() as GfWrapperKind,
    bytes: base64ToBytes(b64),
    crcOk: crc16Xmodem(b64) === declaredCrc,
  };
}

/**
 * Result of `gfPayloadToBytes`: the raw bitmap bytes (one row = N bytes,
 * each byte = 8 pixels, MSB first) plus the integrity flag for the
 * originating wrapper. `crcOk=false` is rendered with a fidelity caveat;
 * `null` from `gfPayloadToBytes` means the payload was undecodable.
 */
interface GfPayloadDecoded {
  data: Uint8Array;
  crcOk: boolean;
}

/** Inflate `:Z64:` zlib payload; null on malformed deflate stream. */
function tryInflateZlib(input: Uint8Array): Uint8Array | null {
  try {
    return unzlibSync(input);
  } catch {
    return null;
  }
}

/** Decode the ASCII-hex output of `decompressGFA` into a packed byte array
 *  so all three GF code paths converge on the same `Uint8Array` shape.
 *  Indexed access + nibble shift instead of `parseInt(slice)` because the
 *  per-byte slice/parseInt pair is the dominant cost on multi-KB bitmaps. */
function gfaHexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) {
    const hi = parseInt(hex[i * 2] ?? "0", 16);
    const lo = parseInt(hex[i * 2 + 1] ?? "0", 16);
    out[i] = (hi << 4) | lo;
  }
  return out;
}

/**
 * Normalise a `^GF{A|B|C}` payload to packed bitmap bytes. Hides the
 * format / wrapper / compression dispatch from the command handler so the
 * latter can stay focused on positioning and pixel painting.
 *
 *  - `:B64:`/`:Z64:` wrapper → base64-decode (then zlib-inflate for Z64)
 *  - `format=A` without wrapper → existing RLE-hex path → bytes
 *  - `format=B`/`C` without wrapper → null (raw binary can't survive the
 *    text-based ZPL channel and the parser never sees intact bytes anyway)
 */
function gfPayloadToBytes(
  rawData: string,
  format: "A" | "B" | "C",
  bytesPerRow: number,
): GfPayloadDecoded | null {
  const wrapper = parseGfWrapper(rawData);
  if (wrapper) {
    const bytes =
      wrapper.kind === "z64" ? tryInflateZlib(wrapper.bytes) : wrapper.bytes;
    if (!bytes) return null;
    return { data: bytes, crcOk: wrapper.crcOk };
  }
  if (format === "A") {
    return { data: gfaHexToBytes(decompressGFA(rawData, bytesPerRow)), crcOk: true };
  }
  return null;
}

/** Outcome of decoding any GF-shaped graphic (^GF or ~DY graphic upload)
 *  into an image-cache entry. Common to both call sites so the per-handler
 *  code only needs to bind it to the right ZPL artifact (label object vs.
 *  preamble registration). */
interface DecodedGraphic {
  imageId: string;
  widthDots: number;
  heightDots: number;
  /** Verbatim `^GF{format},total,data,bpr,DATA` reconstruction kept on the
   *  image so round-trip emit can splice the same byte stream back into
   *  either `^GF` (inline) or `~DY` (preamble) without re-encoding. */
  gfaCache: string;
  crcOk: boolean;
}

/** Entry in the `~DY → ^XG` lookup map: a graphic uploaded earlier in the
 *  stream, keyed by its full `device:stem.ext` path. Structurally a
 *  `DecodedGraphic` without the per-decode CRC flag — that lives on the
 *  partialCmds set instead of on every map entry. */
type UploadedGraphic = Omit<DecodedGraphic, "crcOk">;

/**
 * Decode a GF-shaped payload into an image-cache entry. Shared between the
 * `^GF` inline path and the `~DY` graphic-upload preamble; both have the
 * same payload shape and need the same decoded bitmap, canvas paint, and
 * cache write. Returns `null` when the payload can't be decoded (caller
 * surfaces as browserLimit).
 */
function decodeGraphicToImage(
  rawData: string,
  format: "A" | "B" | "C",
  bytesPerRow: number,
  totalBytesHeader: string,
  dataBytesHeader: string,
  nameHint: string,
): DecodedGraphic | null {
  const decoded = gfPayloadToBytes(rawData, format, bytesPerRow);
  if (!decoded) return null;
  const widthDots = bytesPerRow * BITS_PER_BYTE;
  const heightDots = Math.floor(decoded.data.length / bytesPerRow);
  if (heightDots <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = widthDots;
  canvas.height = heightDots;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2d context");
  const imgData = ctx.createImageData(widthDots, heightDots);
  const pixels = imgData.data;
  for (let row = 0; row < heightDots; row++) {
    for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
      const byte = decoded.data[row * bytesPerRow + byteIdx] ?? 0;
      for (let bit = 0; bit < BITS_PER_BYTE; bit++) {
        const px = byteIdx * BITS_PER_BYTE + bit;
        const idx = (row * widthDots + px) * 4;
        // ZPL ^GF: 1-bit = black (printed), 0-bit = transparent.
        // ImageData starts zero-filled (rgba(0,0,0,0)), which is exactly
        // the 0-bit case — only the 1-bit case needs a write.
        if ((byte & (0x80 >> bit)) !== 0) {
          pixels[idx + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const imageId = crypto.randomUUID();
  putImage({
    id: imageId,
    name: nameHint,
    dataUrl: canvas.toDataURL("image/png"),
    width: widthDots,
    height: heightDots,
  });
  return {
    imageId,
    widthDots,
    heightDots,
    gfaCache: `^GF${format},${totalBytesHeader},${dataBytesHeader},${bytesPerRow},${rawData}`,
    crcOk: decoded.crcOk,
  };
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
  const variables: Variable[] = [];
  const skipped: string[] = [];
  const partialCmds = new Set<string>(); // deduplicates partial-import command codes
  const browserLimit: string[] = [];
  const unknown: string[] = [];
  let pendingComment: string | undefined;

  /** `^FN{n}` slot pending application to the next field flushed. Snapshot
   *  of `pendingComment` is kept separately so a later `^FX` that lands
   *  between `^FN` and `^FS` doesn't pollute the variable's auto-name. */
  let pendingFn: number | null = null;
  let pendingFnComment: string | undefined;

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
  let bcRotation: ZplRotation = "N";
  let bcCode49Mode: Code49Props["mode"] = "A";
  let gsSymbology: Gs1DatabarProps["symbology"] = 1;
  let gsSegments: number | undefined = undefined;
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

  // ^CW alias→path mappings. Single-character aliases that resolve
  // ^A{alias} field references back to the original font path. Built
  // as the parser walks the header, consulted on each ^A{X} encounter.
  const fontAliases = new Map<string, string>();

  // Paths that arrived via ~DY in this stream. Used so a subsequent
  // ^CW for the same path flips the mapping's `embedInZpl` flag —
  // round-trip stability: emit then re-parse should preserve the
  // user's "ship the bytes" intent.
  const downloadedFontPaths = new Set<string>();

  // Graphics uploaded via ~DY in this stream, keyed by the full
  // `device:stem.ext` path. A subsequent ^XG references one of these to
  // instantiate an image object at a position; emitting back goes
  // through the same map so round-trip preserves upload+recall.
  const downloadedGraphics = new Map<string, UploadedGraphic>();

  // ^FH state (field hex indicator)
  let fhActive = false;
  let fhDelimiter = "_";

  // ^CI state (character set / encoding for ^FH byte decoding). Default UTF-8
  // matches our generator output; legacy ZPL using ^CI27 / ^CI0..13 sets a
  // single-byte decoder before ^FH escapes are processed.
  let fhDecoder = getDecoder("utf-8");

  // ^FT vs ^FO: store position type so we can reproduce exactly in re-export.
  let positionIsFT = false;

  // ^CF (change alphanumeric default font) state. cfFontId tracks the
  // font character so the ^A handler can suppress redundant fontId
  // assignments — a text field whose ^A repeats the ^CF font is the
  // generator's way of saying "use the label default", and we want the
  // model to reflect that rather than pinning the alias on every field.
  let cfHeight = 0;
  let cfWidth = 0;
  let cfFontId: string | undefined;

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
  // ^A{id} pending font identifier (e.g. "M", "0"). Mutually exclusive
  // with pendingPrinterFontName at field flush; both reset after use.
  let pendingFontId: string | undefined;

  // ^SN / ^SF serialization state
  let snPending = false;
  let snIncrement = 1;
  let snMode: SerialProps["zplMode"] = "SN";

  const resetFB = () => {
    fbWidth = 0;
    fbLines = 1;
    fbSpacing = 0;
    fbJustify = "L";
  };

  const flushField = () => {
    if (!fieldType || pendingFD === null) return;
    const content = fhActive
      ? decodeFH(pendingFD, fhDelimiter, fhDecoder)
      : pendingFD;
    const posType: "FT" | "FO" = positionIsFT ? "FT" : "FO";
    const comment = takeComment();

    // Decode \& line breaks in ^FB text blocks
    const decoded = fbWidth > 0 ? content.replace(/\\&/g, "\n") : content;

    switch (fieldType) {
      case "text": {
        // ZPL anchors ^FO at cap-top and ^FT at baseline; our internal
        // model stores the Konva render position (EM-top-left) so editor
        // interactions stay shift-free. The FO/I and FO/B shifts also
        // need the rendered ink width — measure it the same way the
        // renderer does so the round-trip stays exact.
        const { inkWidthDots } = computeTextRenderMetrics({
          content: snPending ? `#${decoded}` : decoded,
          fontHeight: textH,
          fontWidth: textW,
          printerFontName: pendingPrinterFontName,
        });
        const modelPos = zplAnchorToModel(
          x,
          y,
          { fontHeight: textH, rotation: textRot },
          posType,
          inkWidthDots,
        );
        // If ^SF was pending, create a serial object instead of text
        if (snPending) {
          objects.push(
            makeObj(
              "serial",
              modelPos.x,
              modelPos.y,
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
          resetFB();
          break;
        }
        const textProps: TextProps = {
          content: decoded,
          fontHeight: textH,
          fontWidth: textW,
          rotation: textRot,
          reverse: getReverseFlag(),
          printerFontName: pendingPrinterFontName,
          fontId: pendingFontId,
        };
        pendingPrinterFontName = undefined;
        pendingFontId = undefined;
        if (fbWidth > 0) {
          textProps.blockWidth = fbWidth;
          textProps.blockLines = fbLines;
          textProps.blockLineSpacing = fbSpacing;
          textProps.blockJustify = fbJustify;
        }
        objects.push(
          makeObj("text", modelPos.x, modelPos.y, textProps, posType, comment),
        );
        resetFB();
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
              rotation: bcRotation,
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
              rotation: bcRotation,
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
              checkDigit: false, // EAN-13 has no user-controlled check digit (^BE auto-appends).
              rotation: bcRotation,
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
              rotation: bcRotation,
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
              rotation: bcRotation,
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
      case "planet":
      case "postal":
      case "upcEanExtension":
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
              rotation: bcRotation,
            } satisfies Barcode1DProps,
            posType,
            comment,
          ),
        );
        break;
      case "gs1databar":
        objects.push(
          makeObj(
            "gs1databar",
            x,
            y,
            {
              content,
              moduleWidth: byModuleWidth,
              symbology: gsSymbology,
              segments: gsSegments,
              rotation: bcRotation,
            } satisfies Gs1DatabarProps,
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
              rotation: bcRotation,
            } satisfies Pdf417Props,
            posType,
            comment,
          ),
        );
        break;
      case "code49":
        objects.push(
          makeObj(
            "code49",
            x,
            y,
            {
              content,
              height: bcHeight,
              moduleWidth: byModuleWidth,
              printInterpretation: bcInterp,
              mode: bcCode49Mode,
              rotation: bcRotation,
            } satisfies Code49Props,
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
              rotation: bcRotation,
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
              rotation: bcRotation,
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
              rotation: bcRotation,
            } satisfies CodablockProps,
            posType,
            comment,
          ),
        );
        break;
    }

    // Apply the pending `^FN{n}` slot (if any) to the field we just
    // pushed. Reuse an existing Variable when its fnNumber matches —
    // ZPL templates often reference the same slot multiple times,
    // and the binding should funnel to one Variable, not duplicates.
    if (pendingFn !== null) {
      const justPushed = objects[objects.length - 1];
      if (justPushed) {
        let variable = variables.find((v) => v.fnNumber === pendingFn);
        if (!variable) {
          const fallback = `field_${pendingFn}`;
          const base = variableNameFromComment(pendingFnComment) ?? fallback;
          variable = {
            id: crypto.randomUUID(),
            name: uniqueVariableName(base, variables),
            fnNumber: pendingFn,
            defaultValue: content,
          };
          variables.push(variable);
        }
        justPushed.variableId = variable.id;
      }
      pendingFn = null;
      pendingFnComment = undefined;
    }

    fieldType = null;
    pendingFD = null;
    frActive = false;
  };

  // ── Command handler map ────────────────────────────────────────────────────
  const noop: Handler = () => void 0;
  const resetComment: Handler = (_, rest) => {
    pendingComment = rest.trim() || undefined;
  };
  // Hand-written ZPL often splits a logical comment across several `^FX` lines
  // before the field they describe. Accumulate them so each line survives on
  // the imported object's comment field; XA/XZ still reset at label boundaries.
  const appendComment: Handler = (_, rest) => {
    const next = rest.trim();
    if (!next) return;
    pendingComment = pendingComment ? `${pendingComment}\n${next}` : next;
  };
  const mkBrowserLimit =
    (prefix: string, delimiter = "^"): Handler =>
    (_, rest) => {
      const tok = `${delimiter}${prefix}${rest}`;
      skipped.push(tok);
      browserLimit.push(tok);
    };

  const readRotation = (raw: string | undefined): ZplRotation =>
    raw && isZplRotation(raw) ? raw : "N";

  const handleAztec: Handler = (p) => {
    fieldType = "aztec";
    bcRotation = readRotation(p[0]);
    aztecMag = int(p[1], 4);
  };

  // Factory for standard 1D barcode commands that share the same state variables.
  // hIdx/iIdx/cIdx are the comma-split parameter indices for height/interp/check.
  const mkBarcode =
    (
      type: string,
      hIdx: number,
      iIdx: number,
      iDefault = "Y",
      cIdx = -1,
    ): Handler =>
    (p) => {
      fieldType = type;
      bcRotation = readRotation(p[0]);
      bcHeight = int(p[hIdx], byHeight || 100);
      bcInterp = (p[iIdx] ?? iDefault) === "Y";
      if (cIdx >= 0) bcCheck = (p[cIdx] ?? "N") === "Y";
    };

  const getReverseFlag = () => lrActive || frActive || undefined;

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
      // Set fontId="0" only when the current ^CF is not already 0 —
      // otherwise the field is just repeating the label default, and
      // we keep fontId undefined so the model says "use the default".
      // When no ^CF has fired, "0" is the historical baseline both the
      // generator and the printer fall back to, so it counts as default.
      pendingFontId = cfFontId && cfFontId !== "0" ? "0" : undefined;
    },

    // ── Change alphanumeric default font ────────────────────────────────────
    // ^CF{font},{height},{width}  → sets default for fields without ^A
    CF(p) {
      const fontId = (p[0] ?? "").trim();
      const explicitHeight = parseInt(p[1] ?? "", 10);
      const explicitWidth = parseInt(p[2] ?? "", 10);
      cfHeight = isNaN(explicitHeight) ? cfHeight : explicitHeight;
      cfWidth = isNaN(explicitWidth) ? cfWidth : explicitWidth;
      if (fontId) {
        labelConfig.defaultFontId = fontId;
        cfFontId = fontId;
      }
      if (!isNaN(explicitHeight) && explicitHeight > 0) {
        labelConfig.defaultFontHeight = explicitHeight;
      }
      if (!isNaN(explicitWidth) && explicitWidth >= 0) {
        labelConfig.defaultFontWidth = explicitWidth;
      }
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
    // mkBarcode(type, hIdx, iIdx, iDefault?, cIdx?)
    // hIdx/iIdx/cIdx = comma-split param positions for height/interp/check
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
    BL: mkBarcode("logmars", 1, 2, "N"), // ^BLN,h,i  — interp default N
    BP: mkBarcode("plessey", 2, 3, "Y", 1), // ^BPN,c,h,i,N
    B5: mkBarcode("planet", 1, 2), // ^B5N,h,i,N
    BZ: mkBarcode("postal", 1, 2), // ^BZN,h,i,N
    BS: mkBarcode("upcEanExtension", 1, 2), // ^BSo,h,f (UPC/EAN 2- or 5-digit supplement)
    B4: (p) => {
      // ^B4o,h,f,m — Code 49. Custom handler for the extra `m`.
      fieldType = "code49";
      bcRotation = readRotation(p[0]);
      bcHeight = int(p[1], byHeight || 20);
      bcInterp = (p[2] ?? "N") === "Y";
      const m = (p[3] ?? "A").toUpperCase();
      bcCode49Mode = /^[A0-5]$/.test(m)
        ? (m as Code49Props["mode"])
        : "A";
    },

    // MSI: check logic is "any letter except N" (not simple "Y") — keep inline
    // ^BMN,{checkType},{height},{interp},N  (checkType: A/B/C/D=enabled, N=none)
    BM(p) {
      fieldType = "msi";
      bcRotation = readRotation(p[0]);
      bcCheck = (p[1] ?? "N") !== "N";
      bcHeight = int(p[2], byHeight || 100);
      bcInterp = (p[3] ?? "Y") === "Y";
    },
    // GS1 Databar: different param layout, also updates byModuleWidth
    // ^BRo,{symbology},{magnification},{separator},{height},{segments}
    BR(p) {
      fieldType = "gs1databar";
      bcRotation = readRotation(p[0]);
      byModuleWidth = int(p[2], byModuleWidth);
      gsSymbology = (int(p[1], 1) as Gs1DatabarProps["symbology"]) || 1;
      gsSegments =
        p[5] !== undefined
          ? int(p[5], GS1_DATABAR_DEFAULT_SEGMENTS)
          : undefined;
    },

    // ^BQN,2,{magnification} — QR Code
    BQ(p) {
      fieldType = "qrcode";
      bcRotation = readRotation(p[0]);
      qrMag = int(p[2], 4);
    },
    // ^BXN,{dimension},{quality} — DataMatrix
    BX(p) {
      fieldType = "datamatrix";
      bcRotation = readRotation(p[0]);
      dmDim = int(p[1], 5);
      dmQuality = int(p[2], 200) as DataMatrixProps["quality"];
    },
    // ^B7N,{rowHeight},{securityLevel},{columns},,, — PDF417
    B7(p) {
      fieldType = "pdf417";
      bcRotation = readRotation(p[0]);
      pdfRowHeight = int(p[1], 10);
      pdfSecurity = int(p[2], 0);
      pdfColumns = int(p[3], 0);
    },
    // ^B0N,{magnification},... / ^BON,... — Aztec (^B0 and ^BO are synonyms)
    B0: handleAztec,
    BO: handleAztec,
    // ^BFN,{rowHeight} — MicroPDF417
    BF(p) {
      fieldType = "micropdf417";
      bcRotation = readRotation(p[0]);
      mpdfRowHeight = int(p[1], 10);
    },
    // ^BBN,{rowHeight},{security},{numCharsPerRow},{numRows},{mode} — CODABLOCK
    BB(p) {
      fieldType = "codablock";
      bcRotation = readRotation(p[0]);
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
    LR(_, rest) {
      lrActive = rest.toUpperCase().startsWith("Y");
    },
    FR() {
      frActive = true;
    },

    // ── Label home (origin offset) ──────────────────────────────────────────
    LH(p) {
      lhX = int(p[0], 0);
      lhY = int(p[1], 0);
    },

    // ── Label top (vertical offset) ─────────────────────────────────────────
    LT(_, rest) {
      ltY = int(rest, 0);
    },

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
              reverse: getReverseFlag(),
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
              reverse: getReverseFlag(),
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
              // Preserve the original thickness so a ZPL round-trip is
              // lossless and the renderer can apply Zebra's dimension
              // promotion (`max(w,t) × max(h,t)`) for fields where
              // thickness exceeds the smaller axis.
              thickness: t,
              filled,
              color,
              rounding,
              reverse: getReverseFlag(),
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
            reverse: getReverseFlag(),
          } satisfies LineProps,
          undefined,
          takeComment(),
        ),
      );
    },
    GF(_, rest) {
      // ^GF{A|B|C},{totalBytes},{totalBytes},{bytesPerRow},{payload}
      //
      // Payload variants the parser understands:
      //   - format=A + raw hex (optionally with G-Y/g-z/!/,/: RLE)
      //   - any format + `:B64:<base64>:<crc>` wrapper (base64-decoded)
      //   - any format + `:Z64:<base64>:<crc>` wrapper (zlib-inflated via
      //     fflate). CRC mismatch → partial finding (printers tolerate),
      //     inflate failure → browserLimit (payload unrecoverable).
      const format = rest[0]?.toUpperCase();
      if (format !== "A" && format !== "B" && format !== "C") {
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

      const gfSummary = `^GF${rest.slice(0, IMPORT_FINDING_PAYLOAD_LIMIT)}…`;
      // Preserve the source bytes-headers verbatim so re-export keeps the
      // firmware's input-buffer hint intact (^GFC/:Z64: has total ≠ data).
      const gfImage = decodeGraphicToImage(
        gfRawData,
        format,
        gfBytesPerRow,
        gfParams[0] ?? "",
        gfParams[1] ?? "",
        `imported_${crypto.randomUUID().slice(0, 8)}.png`,
      );
      if (!gfImage) {
        skipped.push(gfSummary);
        browserLimit.push(gfSummary);
        return;
      }
      if (!gfImage.crcOk) partialCmds.add("^GF");
      const posType: "FT" | "FO" = positionIsFT ? "FT" : "FO";
      objects.push(
        makeObj(
          "image",
          x,
          y,
          {
            imageId: gfImage.imageId,
            widthDots: gfImage.widthDots,
            threshold: 128,
            _gfaCache: gfImage.gfaCache,
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
            // Preserve the original thickness (same rationale as ^GB) so a
            // ZPL round-trip is lossless. UI sets sensible defaults when
            // the user toggles `filled` off; the parser stays faithful.
            thickness: t,
            filled,
            color,
            reverse: getReverseFlag(),
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
            thickness: t,
            filled,
            color,
            lockAspect: true,
            reverse: getReverseFlag(),
          } satisfies EllipseProps,
          undefined,
          takeComment(),
        ),
      );
    },

    // ── Recall stored graphic ──────────────────────────────────────────────
    XG(_, rest) {
      // ^XGd:f.x,mx,my — references a graphic uploaded earlier via ~DY.
      // Two valid imports:
      //  - With preceding ~DY in the stream: full image (bytes + storedAs
      //    with embedInZpl=true) so re-emit produces the same upload+recall.
      //  - Without ~DY: the printer is assumed to host the file out-of-band
      //    (admin pre-loaded). Object gets storedAs.embedInZpl=false and
      //    no cached bitmap; the canvas falls back to a placeholder, the
      //    emitter skips the ~DY preamble but keeps the ^XG reference.
      const firstComma = rest.indexOf(",");
      const xgPath = firstComma === -1 ? rest : rest.slice(0, firstComma);
      const parsed = parseStoragePath(xgPath);
      if (!parsed) {
        skipped.push(`^XG${rest}`);
        browserLimit.push(`^XG${rest}`);
        return;
      }
      const uploaded = downloadedGraphics.get(formatStoragePath(parsed, true));
      const posType: "FT" | "FO" = positionIsFT ? "FT" : "FO";
      if (uploaded) {
        objects.push(
          makeObj(
            "image",
            x,
            y,
            {
              imageId: uploaded.imageId,
              widthDots: uploaded.widthDots,
              threshold: 128,
              _gfaCache: uploaded.gfaCache,
              storedAs: { ...parsed, embedInZpl: true },
            } satisfies ImageProps,
            posType,
            takeComment(),
          ),
        );
        return;
      }
      // Recall-only: no bytes available, but the ZPL is valid and the
      // printer side is assumed to resolve. Surface as partial so the
      // import report flags the degraded preview.
      partialCmds.add("^XG");
      objects.push(
        makeObj(
          "image",
          x,
          y,
          {
            imageId: "",
            widthDots: 200,
            threshold: 128,
            storedAs: { ...parsed, embedInZpl: false },
          } satisfies ImageProps,
          posType,
          takeComment(),
        ),
      );
    },

    // ── Label print settings ────────────────────────────────────────────────
    PQ(p) {
      const qty = int(p[0], 0);
      if (qty > 0) labelConfig.printQuantity = qty;
      // ^PQ q,p,r,o — preserve extended params when present.
      if (p.length > 1) {
        const pause = int(p[1], 0);
        if (pause >= 0 && pause <= 99999999) labelConfig.pauseCount = pause;
      }
      if (p.length > 2) {
        const reps = int(p[2], 0);
        if (reps >= 0 && reps <= 99999999) labelConfig.replicates = reps;
      }
      if (p.length > 3) {
        const o = (p[3] ?? "").toUpperCase();
        if (o === "Y" || o === "N") labelConfig.overridePauseCount = o;
      }
    },
    MM(_, rest) {
      const mode = (rest[0] ?? "").toUpperCase() as LabelConfig["mediaMode"];
      if (mode) labelConfig.mediaMode = mode;
    },
    LS(_, rest) {
      const shift = int(rest, 0);
      if (shift !== 0) labelConfig.labelShift = shift;
    },
    PR(p) {
      const speed = int(p[0], 0);
      if (speed >= 2 && speed <= 14) labelConfig.printSpeed = speed;
      if (p.length > 1) {
        const slew = int(p[1], 0);
        if (slew >= 2 && slew <= 14) labelConfig.slewSpeed = slew;
      }
      if (p.length > 2) {
        const bf = int(p[2], 0);
        if (bf >= 2 && bf <= 14) labelConfig.backfeedSpeed = bf;
      }
    },
    MD(_, rest) {
      // Direct parse: int() falls back to 0 on NaN, which would conflate
      // "absent" with the valid darkness value 0.
      const parsed = parseInt(rest, 10);
      if (!isNaN(parsed) && parsed >= -30 && parsed <= 30) {
        labelConfig.darkness = parsed;
      }
    },
    MT(_, rest) {
      const mt = (rest[0] ?? "").toUpperCase();
      if (mt === "T" || mt === "D") labelConfig.mediaType = mt;
    },
    PO(_, rest) {
      const po = (rest[0] ?? "").toUpperCase();
      if (po === "N" || po === "I") labelConfig.printOrientation = po;
    },
    PM(_, rest) {
      const m = (rest[0] ?? "").toUpperCase();
      if (m === "Y" || m === "N") labelConfig.mirror = m;
    },
    // ~SD — instant darkness set (00..30). Tilde-prefix; the tokenizer
    // drops the delimiter, so we accept this as the canonical SD handler.
    SD(_, rest) {
      const parsed = parseInt(rest, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 30) {
        labelConfig.instantDarkness = parsed;
      }
    },

    // ^CW {alias},{path} — register an alias for a printer-resident font.
    // Subsequent ^A{alias} fields resolve to {path} via the fontAliases
    // map. The mapping is also persisted on labelConfig so the generator
    // can re-emit it on round-trip. Upsert by alias mirrors the
    // Map-set semantics of fontAliases: a later ^CW for the same alias
    // replaces the earlier mapping rather than accumulating duplicates.
    CW(p) {
      const alias = (p[0] ?? "").trim().toUpperCase();
      const path = (p[1] ?? "").trim();
      if (!/^[A-Z0-9]$/.test(alias) || !path) return;
      fontAliases.set(alias, path);
      const list = (labelConfig.customFonts ?? []).filter(
        (m) => m.alias !== alias,
      );
      const entry: CustomFontMapping = { alias, path };
      if (downloadedFontPaths.has(path)) {
        // The bytes already shipped via ~DY earlier in the stream;
        // surface that intent on the model so re-emit will ~DY again.
        entry.embedInZpl = true;
        // The fontCache key is the filename portion of the path
        // (drive prefix stripped), matching how ~DY registers fonts.
        const colonIdx = path.indexOf(":");
        const filename = colonIdx >= 0 ? path.slice(colonIdx + 1) : path;
        if (filename) entry.previewFontName = filename;
      }
      labelConfig.customFonts = [...list, entry];
    },

    // ── ~DY downloaded TrueType payload ─────────────────────────────────────
    // ~DY{drive}:{name},{fmt},{ext},{size},{bpr},{data}
    // Decodes ASCII hex (format 'A') TTF/OTF bytes into the font cache
    // so the canvas can preview the embedded font without a separate
    // upload. The path reconstruction (stem + extension code) round-
    // trips the same form the generator emits. Non-TTF extensions and
    // non-hex formats are left untouched and fall through to the
    // browser-limit bucket so the user sees what was dropped.
    DY(_p, rest) {
      // Parse manually because the data segment can be hundreds of
      // KB of hex; we want to avoid splitting that into the rest of
      // the params array. Param layout up to and including bytes-per-
      // row is fixed-arity, so we walk commas until we've found 5.
      const c: number[] = [];
      for (let i = 0; i < rest.length && c.length < 5; i++) {
        if (rest[i] === ",") c.push(i);
      }
      if (c.length < 5) {
        browserLimit.push(`~DY${rest}`);
        return;
      }
      const [c0, c1, c2, c3, c4] = c;
      if (
        c0 === undefined ||
        c1 === undefined ||
        c2 === undefined ||
        c3 === undefined ||
        c4 === undefined
      ) {
        browserLimit.push(`~DY${rest}`);
        return;
      }
      const path = rest.slice(0, c0);
      const fmt = rest.slice(c0 + 1, c1).toUpperCase();
      const extCode = rest.slice(c1 + 1, c2).toUpperCase();
      const size = parseInt(rest.slice(c2 + 1, c3), 10);
      const dyBytesPerRow = parseInt(rest.slice(c3 + 1, c4), 10);
      const data = rest.slice(c4 + 1);
      const dySummary = `~DY${rest.slice(0, IMPORT_FINDING_PAYLOAD_LIMIT)}…`;

      // Graphic uploads (~DY ...,A/B/C,G,...): decode via the same payload
      // pipeline as ^GF, register the resulting image under the full
      // device:stem.GRF path. A subsequent ^XG can then instantiate it.
      if (extCode === "G" && (fmt === "A" || fmt === "B" || fmt === "C")) {
        if (!path || isNaN(dyBytesPerRow) || dyBytesPerRow <= 0) {
          skipped.push(dySummary);
          browserLimit.push(dySummary);
          return;
        }
        const sizeStr = size > 0 ? String(size) : "";
        const dyImage = decodeGraphicToImage(
          data,
          fmt,
          dyBytesPerRow,
          sizeStr,
          sizeStr,
          `uploaded_${path.replace(/[:.]/g, "_")}.png`,
        );
        if (!dyImage) {
          skipped.push(dySummary);
          browserLimit.push(dySummary);
          return;
        }
        if (!dyImage.crcOk) partialCmds.add("~DY");
        // Path normalisation: ~DY uses `device:stem` without extension; the
        // ^XG side resolves `device:stem.GRF`. Store the `.GRF` form so the
        // XG lookup is direct.
        const parsedDyPath = parseStoragePath(path);
        if (!parsedDyPath) {
          skipped.push(dySummary);
          browserLimit.push(dySummary);
          return;
        }
        downloadedGraphics.set(formatStoragePath(parsedDyPath, true), {
          imageId: dyImage.imageId,
          widthDots: dyImage.widthDots,
          heightDots: dyImage.heightDots,
          gfaCache: dyImage.gfaCache,
        });
        return;
      }

      // Only ASCII-hex TTF/OTF imports are supported. Z64 / compressed
      // payloads need a CRC-checked decoder and stay out of scope.
      if (fmt !== "A" || (extCode !== "T" && extCode !== "B")) {
        browserLimit.push(dySummary);
        return;
      }
      if (!path || isNaN(size) || size <= 0 || data.length < size * 2) {
        browserLimit.push(dySummary);
        return;
      }
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        const byteHex = data.slice(i * 2, i * 2 + 2);
        const b = parseInt(byteHex, 16);
        if (isNaN(b)) {
          browserLimit.push(`~DY${rest.slice(0, 80)}…`);
          return;
        }
        bytes[i] = b;
      }
      // Reconstruct the full filename with extension so the registered
      // name matches what ^CW points at. Generator emits "{stem}" with
      // the extension stripped, so we re-attach based on the code.
      const ext = extCode === "T" ? ".TTF" : ".BIN";
      const filename = path.includes(".")
        ? path.slice(path.lastIndexOf(":") + 1)
        : `${path.slice(path.indexOf(":") + 1)}${ext}`;
      const fullPath = path.includes(".") ? path : `${path}${ext}`;
      try {
        loadFontBytesSync(bytes, filename);
        downloadedFontPaths.add(fullPath);
      } catch {
        // Oversized or otherwise unloadable — surface as browser-limit.
        browserLimit.push(`~DY${path}`);
      }
    },

    // ── Browser-limit: printer-specific features ────────────────────────────
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
    // ^FX: comment field — accumulate across consecutive ^FX lines so the
    // assembled text reaches the next field object as one multi-line comment.
    FX: appendComment,

    // ^CI N: character set / encoding for ^FH byte decoding. Mapped to a
    // TextDecoder; unsupported variants (UTF-16/32, code page 850) keep the
    // current decoder and surface as a partial import.
    CI: (p) => {
      const enc = ciToEncoding(int(p[0]));
      fhDecoder = getDecoder(enc.label);
      if (!enc.supported) partialCmds.add(`^CI${int(p[0])}`);
    },

    // ^FN{n}: declares that the next field is a template slot. The
    // accompanying ^FD payload becomes the slot's default value at
    // flushField time. Out-of-range numbers (Zebra accepts 0/100+ on
    // newer firmware, but our model caps at 99) are ignored so they
    // don't poison the binding.
    FN: (p) => {
      const n = int(p[0]);
      if (n < FN_NUMBER_MIN || n > FN_NUMBER_MAX) {
        partialCmds.add("^FN");
        return;
      }
      pendingFn = n;
      pendingFnComment = pendingComment;
    },
    FV: noop, // field variable — supplies data for ^FN at print time
    FC: noop, // field clock — inserts date/time (requires printer RTC)
    FE: noop, // field concatenation — appends data to current field
    FM: noop, // multiple field origin locations
    FP: noop, // field parameter — per-character text direction
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
      const fontChar = cmd[1] ?? "";
      // Round-trip semantics: when the font character matches the
      // current ^CF, treat the field as "use the label default" and
      // leave pendingFontId undefined so the model carries no per-field
      // override. Otherwise pin the alias on the field so re-emitting
      // produces the same ^A{id} short form. Unknown aliases (no ^CW
      // and not a built-in) still go through — the printer would fall
      // back to font 0 at print, but storing the user's choice keeps
      // the import lossless for editing.
      if (cfFontId && fontChar === cfFontId) {
        pendingFontId = undefined;
      } else {
        pendingFontId = fontChar;
      }
      if (
        !fontAliases.has(fontChar) &&
        !ZPL_BUILTIN_FONT_LETTERS.includes(fontChar)
      ) {
        partialCmds.add(`^${cmd}`);
      }
      continue;
    }

    // Record unknown commands (excluding pure whitespace tokens)
    if (rest.trim() || cmd.trim()) {
      const token = `^${cmd}${rest}`;
      skipped.push(token);
      unknown.push(token);
    }
  }

  // Build findings list. `partialCmds` is deduplicated by command code;
  // the others are per-occurrence in encounter order. pageIndex stays 0
  // here; `zplImportService.importZplText` fills it once it knows which
  // ^XA…^XZ block this came from.
  const findings: ImportFinding[] = [
    ...[...partialCmds].map(
      (command): ImportFinding => ({ kind: "partial", command, pageIndex: 0 }),
    ),
    ...browserLimit.map(
      (command): ImportFinding => ({
        kind: "browserLimit",
        command,
        pageIndex: 0,
      }),
    ),
    ...unknown.map(
      (command): ImportFinding => ({ kind: "unknown", command, pageIndex: 0 }),
    ),
  ];

  return {
    labelConfig,
    objects,
    variables,
    skipped,
    importReport: {
      findings,
      partial: [...partialCmds],
      browserLimit,
      unknown,
    },
  };
}
