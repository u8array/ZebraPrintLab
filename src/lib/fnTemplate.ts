import type { Variable } from "../types/Variable";

// ^FE embeds (#n#) <-> «name» markers. Body forbids » so adjacent markers
// don't merge. Factory form avoids /g lastIndex bleed across callers.

const MARKER_BODY = /«([^»]+)»/;
const markerRe = () => /«([^»]+)»/g;

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
    return `«${newName}»`;
  });
  return touched ? next : content;
}

/** True when `content` carries at least one `«…»` marker. */
export function hasTemplateMarkers(content: string): boolean {
  return MARKER_BODY.test(content);
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
    return name !== undefined ? `«${name}»` : full;
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
