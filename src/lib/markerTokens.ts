import { CLOCK_TOKEN_LABELS } from "./fcTemplate";
import { CLOCK_BODY_RE } from "../types/clockMarker";
import { markerRe } from "../types/Variable";

/** Segment kinds the content editor's colour-mirror layer renders. */
export type MarkerSegment =
  | { kind: "text"; text: string }
  | { kind: "var" | "clock"; text: string }
  | { kind: "orphan"; text: string };

const KNOWN_CLOCK_TOKENS = new Set<string>(CLOCK_TOKEN_LABELS.map((x) => x.token));

/** Classifies a marker body (the text between `«»`) as a known variable, a
 *  known clock token, or an orphan. Single source for tokeniseMarkers and the
 *  editor's click/keyboard selection so the two never drift. */
export function classifyMarkerBody(
  body: string,
  variableNames: ReadonlySet<string>,
): "var" | "clock" | "orphan" {
  const clockMatch = body.match(CLOCK_BODY_RE);
  if (clockMatch) {
    const tok = clockMatch[2] ?? "";
    return KNOWN_CLOCK_TOKENS.has(tok) ? "clock" : "orphan";
  }
  return variableNames.has(body) ? "var" : "orphan";
}

/** Classifies markers var/clock/orphan for editor highlighting. */
export function tokeniseMarkers(
  content: string,
  variableNames: ReadonlySet<string>,
): MarkerSegment[] {
  const out: MarkerSegment[] = [];
  let last = 0;
  for (const m of content.matchAll(markerRe())) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: "text", text: content.slice(last, idx) });
    out.push({ kind: classifyMarkerBody(m[1] ?? "", variableNames), text: m[0] });
    last = idx + m[0].length;
  }
  if (last < content.length) out.push({ kind: "text", text: content.slice(last) });
  return out;
}

/** Drop the index-th marker (var/clock/orphan, in document order) from the
 *  content, leaving literal text and the other markers intact. Out-of-range
 *  indices return the content unchanged. */
export function removeMarkerAt(
  content: string,
  index: number,
  variableNames: ReadonlySet<string>,
): string {
  let markerIndex = -1;
  let out = "";
  for (const seg of tokeniseMarkers(content, variableNames)) {
    if (seg.kind === "text") {
      out += seg.text;
      continue;
    }
    markerIndex += 1;
    if (markerIndex !== index) out += seg.text;
  }
  return out;
}

/** backspace: pos after `»` or inside; delete: pos before `«` or inside. */
export function findAtomicMarker(
  content: string,
  pos: number,
  direction: "backspace" | "delete",
): { start: number; end: number } | null {
  for (const m of content.matchAll(markerRe())) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (direction === "backspace") {
      if (pos > start && pos <= end) return { start, end };
    } else {
      if (pos >= start && pos < end) return { start, end };
    }
  }
  return null;
}

/** Both endpoints treated as inside. */
export function findMarkerContaining(
  content: string,
  pos: number,
): { start: number; end: number } | null {
  for (const m of content.matchAll(markerRe())) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (pos >= start && pos <= end) return { start, end };
  }
  return null;
}
