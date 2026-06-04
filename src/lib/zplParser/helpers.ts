import type { LabelObject } from "../../types/Group";
import { isZplRotation, type ZplRotation } from "../../registry/rotation";

/** Validated ZplRotation or `fallback` (default 'N'). */
export function readRotation(
  raw: string | undefined,
  fallback: ZplRotation = "N",
): ZplRotation {
  return raw && isZplRotation(raw) ? raw : fallback;
}

/** Validate ^GB/^GC/^GD/^GE colour char; default "B" per spec. */
export function readColor(raw: string | undefined): "B" | "W" {
  return raw === "W" ? "W" : "B";
}

/** First non-space char, upper-cased — single-char enum handlers. */
export function firstChar(rest: string): string {
  return (rest.trim()[0] ?? "").toUpperCase();
}

/** Live command-prefix chars; the tokenizer reads these on every char
 *  scan so ^CC/^CT mutations take effect on the very next command. */
export interface TokenizerChars {
  caretChar: string;
  tildeChar: string;
}

/** Stream tokens incrementally so ^CC/^CT changes mid-parse apply to
 *  subsequent commands. The caller passes a live ref (typically
 *  `s.format`) whose `caretChar`/`tildeChar` may be mutated between
 *  iterations. */
export function* tokenize(
  zpl: string,
  chars: TokenizerChars,
): Generator<{ cmd: string; rest: string }> {
  let pos = 0;
  while (pos < zpl.length) {
    let cmdStart = -1;
    for (let i = pos; i < zpl.length; i++) {
      const ch = zpl[i];
      if (ch === chars.caretChar || ch === chars.tildeChar) {
        cmdStart = i;
        break;
      }
    }
    if (cmdStart === -1 || cmdStart + 3 > zpl.length) return;
    const cmd = zpl.slice(cmdStart + 1, cmdStart + 3).toUpperCase();
    // ^CC/^CT/^CD take exactly one argument character; everything after
    // it belongs to the next command (using the new prefix if the handler
    // mutates it). Generic commands consume rest until the next delimiter.
    if (cmd === "CC" || cmd === "CT" || cmd === "CD") {
      const argChar = zpl[cmdStart + 3] ?? "";
      pos = cmdStart + 4;
      yield { cmd, rest: argChar };
      continue;
    }
    let endPos = zpl.length;
    for (let i = cmdStart + 3; i < zpl.length; i++) {
      const ch = zpl[i];
      if (ch === chars.caretChar || ch === chars.tildeChar) {
        endPos = i;
        break;
      }
    }
    pos = endPos;
    yield { cmd, rest: zpl.slice(cmdStart + 3, endPos) };
  }
}

export function int(s: string | undefined, fallback = 0): number {
  const n = Number.parseInt(s ?? "", 10);
  return Number.isNaN(n) ? fallback : n;
}

/** Optional-form of the dot-quantity reader. Returns undefined when
 *  the param is missing/NaN. `parseFloat` is load-bearing: ^MUI/^MUM
 *  admits fractional unit values (`^FO0.5,0.5` = half an inch);
 *  `parseInt` would silently truncate to 0. */
export function intDotsOrUndef(
  s: string | undefined,
  unitScale: number,
): number | undefined {
  const n = Number.parseFloat(s ?? "");
  if (Number.isNaN(n)) return undefined;
  return Math.round(n * unitScale);
}

/** Read a dot-quantity, applying the active ^MU `a`-slot multiplier.
 *  Use at every site the spec documents as "dots"; non-dot params
 *  (rotation, mode, counts) stay on plain `int`. */
export function intDots(
  s: string | undefined,
  unitScale: number,
  fallback = 0,
): number {
  return intDotsOrUndef(s, unitScale) ?? fallback;
}

/** Bind `intDots`/`intDotsOrUndef` to a parser state's live unit
 *  scale, so handler factories don't each rebuild the same closures.
 *  Returns helpers that read `state.format.unitScale` at call time
 *  (load-bearing: ^MU mid-format mutates it). */
export function dotsFor(state: { format: { unitScale: number } }): {
  dots: (raw: string | undefined, fb?: number) => number;
  dotsOrUndef: (raw: string | undefined) => number | undefined;
} {
  return {
    dots: (raw, fb = 0) => intDots(raw, state.format.unitScale, fb),
    dotsOrUndef: (raw) => intDotsOrUndef(raw, state.format.unitScale),
  };
}

/** Returns v if within [r.min, r.max], else undefined. */
export function inRange(v: number | undefined, r: { min: number; max: number }): number | undefined {
  return v !== undefined && v >= r.min && v <= r.max ? v : undefined;
}

/** Trim + uppercase for case-insensitive enum match. */
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

/** ^CI N → TextDecoder label; unsupported variants fall back to UTF-8. */
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

/** ^FH hex escapes → decoded string; contiguous pairs collect for multi-byte glyphs. */
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
