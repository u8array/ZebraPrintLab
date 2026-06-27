import type { LabelObjectBase } from "../types/LabelObject";
import { filterContent, type ContentSpec } from "./contentSpec";

/** ^SN/^SF accept only alphanumerics in the serialized payload. */
export const serialSpec: ContentSpec = { charset: "0-9A-Za-z" };

/** Filter a serial seed to the intersection of the serial charset AND the
 *  symbology's own content charset (sequential filtering = intersection), so a
 *  numeric-only symbology (Interleaved 2of5, MSI) can't keep a letter seed.
 *  Serial-eligible types carry no maxLength, so only the charset narrows. */
export function serialSeed(raw: string, spec?: ContentSpec): string {
  return filterContent(filterContent(raw, serialSpec), spec);
}

/** Per-field firmware counter. Present on a field's props = serial mode:
 *  `content` is the seed, emitted via ^SN/^SF instead of a plain ^FD. */
export interface SerialMode {
  increment: number;
  zplMode: "SN" | "SF";
}

/** Seed for a freshly enabled serial field. */
export const SERIAL_DEFAULT: SerialMode = { increment: 1, zplMode: "SN" };

/** Single parser-side writer that flags a just-parsed leaf as serial. The caller
 *  keeps the leaf's seed content (never a variable marker), so a field carrying
 *  both ^FN and ^SN/^SF (contradictory ZPL) resolves to serial. */
export function applySerialToLeaf(
  leaf: LabelObjectBase & { props?: object },
  mode: SerialMode,
): void {
  leaf.props = { ...(leaf.props ?? {}), serial: mode };
}

/** ^SF mask for an alphanumeric seed: one placeholder per character (digit→`d`,
 *  upper→`A`, lower→`a`). The seed is charset-filtered to `0-9A-Za-z`, so no
 *  `%`-skip positions arise and the mask aligns 1:1 with the ^FD string. Carry
 *  rolls right-to-left through the mask (e.g. `AAdddd`: BL9999 → BM0000). */
function serialMask(seed: string): string {
  return [...seed]
    .map((c) => (/[0-9]/.test(c) ? "d" : /[a-z]/.test(c) ? "a" : "A"))
    .join("");
}

/** Serialization field data for a seed, spec-conform per the ZPL guide.
 *  ^SN (`^SNv,n,z`): the start value `v` IS the field data, no ^FD; `z=Y` keeps
 *  the seed width via leading zeros. Indexes the rightmost integers only.
 *  ^SF (`^SFa,b`): a standard ^FD plus a mask `a` (which characters serialize)
 *  and increment `b`; supports alphanumeric rollover. The seed is re-filtered to
 *  alphanumerics so it can't smuggle ^/~ or commas into the parameter list. */
export function serialFieldData(content: string, serial: SerialMode): string {
  const safe = filterContent(content, serialSpec);
  if (serial.zplMode === "SF") {
    return `^FD${safe}^SF${serialMask(safe)},${serial.increment}^FS`;
  }
  return `^SN${safe},${serial.increment},Y^FS`;
}
