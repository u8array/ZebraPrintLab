import type { LabelObject } from "../../types/Group";

// ZPL commands start with ^ or ~ followed by 2 characters
export function tokenize(zpl: string): { cmd: string; rest: string }[] {
  const tokens: { cmd: string; rest: string }[] = [];
  // Split on both ^ and ~ delimiters, preserving the delimiter type.
  const parts = zpl.split(/(?=[\^~])/);
  for (const part of parts) {
    if (part.length < 3) continue;
    const delimiter = part[0];
    if (delimiter !== "^" && delimiter !== "~") continue;
    const cmd = part.slice(1, 3).toUpperCase();
    const rest = part.slice(3);
    tokens.push({ cmd, rest });
  }
  return tokens;
}

export function int(s: string | undefined, fallback = 0): number {
  const n = Number.parseInt(s ?? "", 10);
  return Number.isNaN(n) ? fallback : n;
}

/** Returns the value when in range, undefined otherwise — matches the
 *  parser's "silently drop invalid params" contract while removing the
 *  repetitive `>= R.min && <= R.max` shape from each ranged handler. */
export function inRange(v: number | undefined, r: { min: number; max: number }): number | undefined {
  return v !== undefined && v >= r.min && v <= r.max ? v : undefined;
}

/** Trims surrounding whitespace (tokenizer keeps trailing `\n` etc. on
 *  the last positional) and upper-cases for case-insensitive enum
 *  matches. */
export function strParam(s: string | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

export function makeObj(
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

/** Derive a Variable name from a `^FX` comment that landed just before
 *  the `^FN`. Strips well-known prefixes (`Field:`, `Variable:`, `Var:`)
 *  so "Field: Customer Name" becomes `Customer_Name`. Returns null when
 *  the comment is missing or sanitises to empty. */
export function variableNameFromComment(comment: string | undefined): string | null {
  if (!comment) return null;
  const cleaned = comment
    .replace(/^\s*(field|variable|var)\s*[:-]\s*/i, "")
    .trim()
    .replace(/\s+/g, "_");
  return cleaned === "" ? null : cleaned;
}

/**
 * Map a ^CI N parameter to a TextDecoder label. ^CI28 = UTF-8;
 * ^CI27 = Windows-1252; legacy ^CI0..13 are 7-bit-ASCII-compatible
 * code-page variants for which Windows-1252 is a safe superset for `^FH`
 * decoding. Unsupported encodings fall back to UTF-8 with the command
 * surfaced via importReport.partial.
 */
export function ciToEncoding(n: number): { label: string; supported: boolean } {
  if (n === 28) return { label: "utf-8", supported: true };
  if (n === 27) return { label: "windows-1252", supported: true };
  if (n >= 0 && n <= 13) return { label: "windows-1252", supported: true };
  return { label: "utf-8", supported: false };
}

const decoderCache = new Map<string, TextDecoder>();
export function getDecoder(label: string): TextDecoder {
  let dec = decoderCache.get(label);
  if (!dec) {
    dec = new TextDecoder(label);
    decoderCache.set(label, dec);
  }
  return dec;
}

/**
 * Decode ^FH hex escapes: replaces runs of {delimiter}XX with the string
 * for the byte sequence under the active ^CI encoding. A single non-ASCII
 * glyph may span multiple pairs (e.g. `_C3_A4` → `ä` under UTF-8), so
 * contiguous pairs collect into a Uint8Array for one TextDecoder pass.
 * Invalid byte sequences become U+FFFD.
 */
export function decodeFH(
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
