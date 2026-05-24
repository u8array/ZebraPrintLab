import { CLOCK_TOKEN_LABELS } from "./fcTemplate";

/** Segment kinds the content editor's colour-mirror layer renders. */
export type MarkerSegment =
  | { kind: "text"; text: string }
  | { kind: "var" | "clock"; text: string }
  | { kind: "orphan"; text: string };

const MARKER_RE = /«([^»]+)»/g;
const KNOWN_CLOCK_TOKENS = new Set<string>(CLOCK_TOKEN_LABELS.map((x) => x.token));

/** Tokenise template content into literal / marker segments so a
 *  highlight layer can colour markers without breaking literal text.
 *  Marker grammar matches both variable markers (`«name»`) and clock
 *  markers (`«clock:T»`) — same `«…»` family.
 *
 *  Markers are classified into var / clock / orphan:
 *   - var:    variable name resolves to a defined Variable    → accent
 *   - clock:  clock-token letter known to TOKEN_FORMATTERS   → info
 *   - orphan: variable name unknown OR clock token unknown   → red
 *  Orphan-detection is the visual half of validation — the user sees
 *  immediately when a marker won't resolve at render time. */
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
