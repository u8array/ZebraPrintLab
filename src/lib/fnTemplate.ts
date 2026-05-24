import type { Variable } from "../types/Variable";

/**
 * `^FE` (Field number Embed character) lets a single `^FD` payload
 * reference multiple `^FN` slots inline. We store those references in
 * `content` as `«variableName»` markers — the same syntax the canvas
 * already uses to visualise unbound variables in schema mode, so the
 * stored content is human-readable in the properties panel too.
 *
 * The ZPL boundary still uses the numeric `#n#` embed form; this
 * module is the bidirectional bridge.
 */

/** Single `«name»` marker. Body forbids `»` so `«a»«b»` can't merge.
 *  Use `markerRe()` for the /g form needed by replace/matchAll — the
 *  shared `/g` instance would carry `lastIndex` state across callers
 *  and produce silent off-by-one bugs. */
const MARKER_BODY = /«([^»]+)»/;
const markerRe = () => /«([^»]+)»/g;

/** Rewrite every `«oldName»` marker in `content` to `«newName»`.
 *  Identity-preserving when no marker matches, so callers can
 *  compare references to skip a downstream update. */
export function renameTemplateMarker(
  content: string,
  oldName: string,
  newName: string,
): string {
  if (oldName === newName) return content;
  let touched = false;
  const next = content.replace(markerRe(), (full, name: string) => {
    if (name !== oldName) return full;
    touched = true;
    return `«${newName}»`;
  });
  return touched ? next : content;
}

/** True when `content` carries at least one `«…»` marker. */
export function hasTemplateMarkers(content: string): boolean {
  return MARKER_BODY.test(content);
}

/** Return the variable names referenced by every marker in `content`,
 *  in source order, with duplicates preserved (caller dedupes). */
export function extractTemplateRefs(content: string): string[] {
  return [...content.matchAll(markerRe())]
    .map((m) => m[1])
    .filter((n): n is string => n !== undefined);
}

/** Replace every `«name»` marker with the result of `resolve(name)`.
 *  Markers whose name doesn't resolve stay literal — caller decides
 *  the fallback (drop, keep, error). */
export function resolveTemplateMarkers(
  content: string,
  resolve: (name: string) => string | undefined,
): string {
  return content.replace(markerRe(), (full, name: string) => {
    const v = resolve(name);
    return v !== undefined ? v : full;
  });
}

/**
 * Convert a ZPL `^FD`-with-embeds payload (`Hello #1#-#2#`) into a
 * template content string with `«name»` markers. Unknown FN numbers
 * (no Variable defined) are left as the literal embed text so the
 * round-trip stays loss-less on subsequent re-export.
 *
 * `embedChar` is whatever the most recent `^FE` set (default `#`).
 * Both whole-field `#n#` and substring `#n,offset,length,…#` forms
 * are recognised; the substring slice arguments are discarded —
 * Zebra evaluates them at print time and we don't replicate that
 * (lossy here, documented).
 */
export function embedsToMarkers(
  payload: string,
  embedChar: string,
  fnToName: ReadonlyMap<number, string>,
): string {
  // Escape the embed delimiter for the regex; ^FE values are single
  // ASCII chars so we don't need a general escape function.
  const e = embedChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${e}(\\d+)(?:,[^${e}]*)?${e}`, "g");
  return payload.replace(re, (full, digits: string) => {
    const n = parseInt(digits, 10);
    const name = fnToName.get(n);
    return name !== undefined ? `«${name}»` : full;
  });
}

/**
 * Convert template markers (`«name»`) in `content` back to ZPL `#n#`
 * embeds, using the Variables collection to map name → fnNumber.
 * Markers whose name has no matching Variable fall through as literal
 * text (the generator's fallback when a binding has been deleted).
 * Returns both the encoded payload and the set of fnNumbers actually
 * referenced, so the generator can emit the matching `^FN` headers.
 */
export function markersToEmbeds(
  content: string,
  variables: readonly Variable[],
  embedChar: string,
): { payload: string; referencedFnNumbers: ReadonlySet<number> } {
  const byName = new Map(variables.map((v) => [v.name, v]));
  const referenced = new Set<number>();
  const payload = content.replace(markerRe(), (full, name: string) => {
    const v = byName.get(name);
    if (!v) return full;
    referenced.add(v.fnNumber);
    return `${embedChar}${v.fnNumber}${embedChar}`;
  });
  return { payload, referencedFnNumbers: referenced };
}

/**
 * Pick an embed character that doesn't appear literally in any of the
 * `payloads`. Default `#` is preferred (matches ZPL's own default and
 * needs no `^FE` directive); falls back through a small ranked list
 * of safe ASCII punctuation before giving up. Returns `null` when
 * every candidate clashes — caller should escape with `^FH` instead
 * (rare; would need 7+ literal punctuation chars in the data).
 */
// `^` and `~` are reserved ZPL command prefixes; never offer them.
const EMBED_CHAR_CANDIDATES = ["#", "@", "|", "%", "&", "?", "!"] as const;

export function pickEmbedChar(payloads: readonly string[]): string | null {
  for (const c of EMBED_CHAR_CANDIDATES) {
    if (payloads.every((p) => !p.includes(c))) return c;
  }
  return null;
}
