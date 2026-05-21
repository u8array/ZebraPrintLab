/**
 * Helpers for Zebra storage paths: `device:name` (no extension) and
 * `device:name.ext` (with extension). The two forms appear in different
 * ZPL commands — `~DY` headers use the bare form (extension is encoded
 * in a separate param), `^XG` references use the dot-suffixed form.
 *
 * Keeping the parse/format pair in one place stops the two forms from
 * drifting apart across the parser, emitter, and image registry.
 */

export interface StoragePath {
  /** Storage device prefix without trailing colon: "R", "E", "B", "A". */
  device: string;
  /** Filename stem (no extension). */
  name: string;
}

/** Extension paired with `^GF`-shaped graphic uploads. Zebra firmware
 *  persists `~DY{path},*,G,...` as `{path}.GRF` on the device. */
export const GRAPHIC_EXT = "GRF";

/**
 * Parse a `device:name` or `device:name.ext` storage path into structured
 * parts. The extension (if any) is dropped — callers re-attach via
 * `formatStoragePath` when emitting. Returns null when the input lacks a
 * `:` separator, signalling a malformed path.
 */
export function parseStoragePath(raw: string): StoragePath | null {
  const colonAt = raw.indexOf(":");
  if (colonAt <= 0) return null;
  const device = raw.slice(0, colonAt);
  const stemWithExt = raw.slice(colonAt + 1);
  // Drop everything from the last `.` onwards. dotAt === 0 means the
  // stem starts with a dot (only an extension) — treat as malformed via
  // the empty-name guard below.
  const dotAt = stemWithExt.lastIndexOf(".");
  const name = dotAt === -1 ? stemWithExt : stemWithExt.slice(0, dotAt);
  if (!name) return null;
  return { device, name };
}

/**
 * Render a storage path back to its ZPL form. `withExt: true` produces
 * `device:name.GRF` (for `^XG` recalls); `withExt: false` produces the
 * bare `device:name` (for `~DY` headers, where the extension is encoded
 * in the next param instead).
 */
export function formatStoragePath(p: StoragePath, withExt: boolean): string {
  return withExt ? `${p.device}:${p.name}.${GRAPHIC_EXT}` : `${p.device}:${p.name}`;
}
