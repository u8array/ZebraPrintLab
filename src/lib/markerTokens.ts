import { CLOCK_TOKEN_LABELS } from "./fcTemplate";

/** Segment kinds the content editor's colour-mirror layer renders. */
export type MarkerSegment =
  | { kind: "text"; text: string }
  | { kind: "var" | "clock"; text: string }
  | { kind: "orphan"; text: string };

const MARKER_RE = /«([^»]+)»/g;
const KNOWN_CLOCK_TOKENS = new Set<string>(CLOCK_TOKEN_LABELS.map((x) => x.token));

/** Classifies markers var/clock/orphan for editor highlighting. */
export function tokeniseMarkers(
  content: string,
  variableNames: ReadonlySet<string>,
): MarkerSegment[] {
  const out: MarkerSegment[] = [];
  let last = 0;
  for (const m of content.matchAll(MARKER_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: "text", text: content.slice(last, idx) });
    const body = m[1] ?? "";
    if (body.startsWith("clock:")) {
      const tok = body.slice("clock:".length);
      out.push({ kind: KNOWN_CLOCK_TOKENS.has(tok) ? "clock" : "orphan", text: m[0] });
    } else {
      out.push({ kind: variableNames.has(body) ? "var" : "orphan", text: m[0] });
    }
    last = idx + m[0].length;
  }
  if (last < content.length) out.push({ kind: "text", text: content.slice(last) });
  return out;
}

/** backspace: pos after `»` or inside; delete: pos before `«` or inside. */
export function findAtomicMarker(
  content: string,
  pos: number,
  direction: "backspace" | "delete",
): { start: number; end: number } | null {
  for (const m of content.matchAll(MARKER_RE)) {
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
  for (const m of content.matchAll(MARKER_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (pos >= start && pos <= end) return { start, end };
  }
  return null;
}
