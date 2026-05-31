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
