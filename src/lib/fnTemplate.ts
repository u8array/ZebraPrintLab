import { markerOf, type Variable } from "../types/Variable";

// ^FE embeds (#n#) <-> «name» markers. Body forbids » so adjacent markers
// don't merge. Factory form avoids /g lastIndex bleed across callers.

const MARKER_BODY = /«([^»]+)»/;
const markerRe = () => /«([^»]+)»/g;

/** Replace every `«name»` marker with a literal `replacement` (identity-
 *  preserving on no match). Used when a variable is deleted so its template
 *  fields keep the last-known value as literal text, not an orphan marker. */
export function substituteTemplateMarker(
  content: string,
  name: string,
  replacement: string,
): string {
  let touched = false;
  const next = content.replace(markerRe(), (full, n: string) => {
    if (n !== name) return full;
    touched = true;
    return replacement;
  });
  return touched ? next : content;
}

/** Identity-preserving on no-match. */
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
    return markerOf(newName);
  });
  return touched ? next : content;
}

/** Rename many markers in ONE pass, looking each up against the ORIGINAL name.
 *  Order-independent and collision-safe: a swap (`a→b`, `b→a`) or chain can't
 *  cascade the way sequential single renames would. Identity on no match. */
export function renameTemplateMarkers(
  content: string,
  renames: ReadonlyMap<string, string>,
): string {
  if (renames.size === 0) return content;
  let touched = false;
  const next = content.replace(markerRe(), (full, name: string) => {
    const to = renames.get(name);
    if (to === undefined) return full;
    touched = true;
    return markerOf(to);
  });
  return touched ? next : content;
}

/** True when `content` carries at least one `«…»` marker. */
export function hasTemplateMarkers(content: string): boolean {
  return MARKER_BODY.test(content);
}

/** A length cap bounds only a purely-literal payload: once a template marker is
 *  present the printed length is the variable's value (unknown here), so the cap
 *  is skipped to avoid truncating the canonical `«…»` token. Returns `value`
 *  unchanged when no cap applies. */
export function capLiteralLength(value: string, maxLength: number | undefined): string {
  if (maxLength === undefined || hasTemplateMarkers(value)) return value;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/** Characters of `insertion` that may be inserted into `value` (replacing a
 *  selection of `selectionLen` chars) under a literal length cap. `Infinity`
 *  when no cap applies (cap undefined, or a marker is present in either side). */
export function literalInsertRoom(
  value: string,
  selectionLen: number,
  insertion: string,
  maxLength: number | undefined,
): number {
  if (maxLength === undefined || hasTemplateMarkers(value) || hasTemplateMarkers(insertion)) {
    return Infinity;
  }
  return Math.max(0, maxLength - (value.length - selectionLen));
}

/** Source order with duplicates (caller dedupes). */
export function extractTemplateRefs(content: string): string[] {
  return [...content.matchAll(markerRe())]
    .map((m) => m[1])
    .filter((n): n is string => n !== undefined);
}

/** Unresolved markers stay literal. */
export function resolveTemplateMarkers(
  content: string,
  resolve: (name: string) => string | undefined,
): string {
  return content.replace(markerRe(), (full, name: string) => {
    const v = resolve(name);
    return v !== undefined ? v : full;
  });
}

/** Unknown FN numbers stay literal; substring slice args dropped (lossy). */
export function embedsToMarkers(
  payload: string,
  embedChar: string,
  fnToName: ReadonlyMap<number, string>,
): string {
  const e = embedChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${e}(\\d+)(?:,[^${e}]*)?${e}`, "g");
  return payload.replace(re, (full, digits: string) => {
    const n = parseInt(digits, 10);
    const name = fnToName.get(n);
    return name !== undefined ? markerOf(name) : full;
  });
}

/** Unknown markers fall through literal; returns referenced fnNumbers
 *  so generator can emit matching ^FN headers. */
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

/** Null when every candidate clashes (caller falls back to ^FH escape). */
// ^ and ~ are reserved ZPL prefixes; never offer them.
const EMBED_CHAR_CANDIDATES = ["#", "@", "|", "%", "&", "?", "!"] as const;

export function pickEmbedChar(payloads: readonly string[]): string | null {
  for (const c of EMBED_CHAR_CANDIDATES) {
    if (payloads.every((p) => !p.includes(c))) return c;
  }
  return null;
}
