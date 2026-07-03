import { getEntry, type LeafObject } from "../registry";
import { objectBoundsDots, offLabelPlacement, type ObjectBoundsCtx } from "./objectBounds";
import { emittedAnchorDots } from "./emittedAnchor";
import { suspiciousCharDetail } from "./suspiciousChars";
import { GS1_DATAMATRIX_ESCAPE, GS1_GS, parseGs1ToSegments, validateGs1Segment, validateGs1SegmentResolved } from "./gs1";
import { extractTemplateRefs, hasTemplateMarkers } from "./fnTemplate";
import { isLoneMarker } from "./variableField";
import { parseContent, typedContentIncompleteRows, typedContentMarkerFindings } from "./typedContent";
import { getObjectStringContent, resolveForRow, variableSubstitutions } from "./variableBinding";
import { resolveTextMode } from "../registry/text";
import type { CsvMapping, Variable } from "../types/Variable";
import {
  PREFLIGHT_SEVERITY,
  type PreflightFinding,
  type PreflightKind,
  type PreflightSeverity,
} from "../types/preflight";

export { PREFLIGHT_SEVERITY };
export type { PreflightFinding, PreflightKind, PreflightSeverity };

interface MarkerValueDeps {
  variables: readonly Variable[];
  csvDataset: { headers: readonly string[]; rows: readonly (readonly string[])[] } | null;
  csvMapping: CsvMapping | null;
}

// Per-leaf cache: the row-walk over a large CSV must not rerun every render.
// Deps are compared by identity (store state is immutable).
const markerValueCache = new WeakMap<
  LeafObject,
  MarkerValueDeps & { findings: PreflightFinding[] }
>();

/** Export-side warning for typed-content, GS1 and block-mode marker values:
 *  the builder's Apply gate only covers authoring time, so a later CSV
 *  re-import, mapping change or edited default surfaces here, where the
 *  warnings track what prints. */
export function markerValueFindings(
  leaves: readonly LeafObject[],
  deps: MarkerValueDeps,
): PreflightFinding[] {
  const out: PreflightFinding[] = [];
  const finding = (leaf: LeafObject, kind: "markerValueUnsafe" | "gs1ValueInvalid", detail: string): PreflightFinding => ({
    objectId: leaf.id,
    kind,
    severity: PREFLIGHT_SEVERITY[kind],
    detail,
  });
  for (const leaf of leaves) {
    const content = getObjectStringContent(leaf);
    if (content === undefined || !hasTemplateMarkers(content)) continue;
    const gs1Data = (leaf.props as { gs1?: boolean }).gs1 === true || leaf.type === "gs1databar";
    const typed = !gs1Data && !!getEntry(leaf.type)?.typedContent;
    const blockMode =
      !gs1Data && !typed && leaf.type === "text"
        ? resolveTextMode(leaf.props as Parameters<typeof resolveTextMode>[0])
        : null;
    const blockHazard = blockMode === "tb" ? "<" : blockMode === "fb" ? "\\" : null;
    if (!gs1Data && !typed && !blockHazard) continue;
    const hit = markerValueCache.get(leaf);
    if (
      hit &&
      hit.variables === deps.variables &&
      hit.csvDataset === deps.csvDataset &&
      hit.csvMapping === deps.csvMapping
    ) {
      out.push(...hit.findings);
      continue;
    }
    const findings: PreflightFinding[] = [];
    if (gs1Data) {
      if (isLoneMarker(content)) {
        // Single-bind: the runtime value IS the whole GS1 payload. The encode
        // badge already covers the ACTIVE substitution (defaults, or the
        // active row), so only the OTHER CSV rows need checking here; without
        // a dataset there is nothing the badge doesn't see.
        const rows = deps.csvDataset && deps.csvMapping ? deps.csvDataset.rows.map((_, i) => i) : [];
        const details: string[] = [];
        for (const rowIdx of rows) {
          const resolved = resolveForRow(content, rowIdx, deps.variables, deps.csvDataset, deps.csvMapping);
          const at = rowIdx < 0 ? "defaults" : `row ${rowIdx + 1}`;
          const segs = parseGs1ToSegments(resolved);
          if (segs === null || segs.length === 0) {
            details.push(`${at}: does not parse as GS1`);
          } else {
            for (const sg of segs) {
              const err = validateGs1Segment(sg.ai, sg.value);
              if (err) details.push(`${at}: (${sg.ai}) ${err}`);
            }
          }
          if (details.length >= 4) break;
        }
        if (details.length > 0) {
          findings.push(finding(leaf, "gs1ValueInvalid", details.slice(0, 3).join("; ") + (details.length > 3 ? "; …" : "")));
        }
      } else {
        const segments = parseGs1ToSegments(content, deps.variables);
        if (segments === null) {
          findings.push(finding(leaf, "gs1ValueInvalid", "variable widths no longer fit the AI structure"));
        } else {
          // Structure parses: validate every printing substitution (each CSV
          // row, else the defaults) per marker segment against the AI's
          // length/charset/date rules. The resolved value IS the runtime
          // value here, so an empty variable-AI value is a real error.
          const rows = deps.csvDataset && deps.csvMapping ? deps.csvDataset.rows.map((_, i) => i) : [-1];
          const details: string[] = [];
          outer: for (const rowIdx of rows) {
            for (const seg of segments) {
              if (!hasTemplateMarkers(seg.value)) continue;
              const resolved = resolveForRow(seg.value, rowIdx, deps.variables, deps.csvDataset, deps.csvMapping);
              const at = rowIdx < 0 ? "defaults" : `row ${rowIdx + 1}`;
              const err = validateGs1SegmentResolved(seg.ai, seg.value, resolved, false);
              if (err) details.push(`${at}: (${seg.ai}) ${err}`);
              // GS1 DataMatrix: the ^BX escape char in a SUBSTITUTED value is
              // re-read as an escape sequence at print (FNC1 / de-doubling);
              // the literal-time doubling can't cover ^FN-inserted data. `_`
              // is a valid GS1 char, so the charset check won't catch it.
              if (leaf.type === "datamatrix" && resolved.includes(GS1_DATAMATRIX_ESCAPE)) {
                details.push(`${at}: (${seg.ai}) "${GS1_DATAMATRIX_ESCAPE}" collides with the ^BX escape character`);
              }
              if (details.length >= 4) break outer;
            }
          }
          if (details.length > 0) {
            findings.push(finding(leaf, "gs1ValueInvalid", details.slice(0, 3).join("; ") + (details.length > 3 ? "; …" : "")));
          }
        }
      }
    } else if (typed) {
      const parsed = parseContent(content);
      const errors = typedContentMarkerFindings(
        parsed.type, parsed.fields, deps.variables, deps.csvDataset, deps.csvMapping,
      );
      for (const [field, chars] of Object.entries(errors)) {
        findings.push(finding(leaf, "markerValueUnsafe", `${field}: ${chars}`));
      }
      const rows = typedContentIncompleteRows(
        parsed.type, parsed.fields, deps.variables, deps.csvDataset, deps.csvMapping,
      );
      if (rows.length > 0) {
        const shown = rows.slice(0, 5).join(", ") + (rows.length > 5 ? ", …" : "");
        findings.push(finding(leaf, "markerValueUnsafe", rows[0] === 0 ? "incomplete with defaults" : `incomplete rows: ${shown}`));
      }
    } else if (blockHazard && !isLoneMarker(content)) {
      // ^TB/^FB run their block escaping over literals at emit and over
      // single-bind values via encodeDefault/fdTransform, but a TEMPLATE slot
      // value is inserted raw at print, where a block-control char corrupts
      // the block. Shared ^FN slots make per-use escaping impossible, so warn.
      const byName = new Map(deps.variables.map((v) => [v.name, v]));
      const dirty: string[] = [];
      for (const name of new Set(extractTemplateRefs(content))) {
        const v = byName.get(name);
        if (!v) continue;
        if (variableSubstitutions(v, deps.csvDataset, deps.csvMapping).some((val) => val.includes(blockHazard))) {
          dirty.push(v.name);
        }
      }
      if (dirty.length > 0) {
        findings.push(finding(
          leaf,
          "markerValueUnsafe",
          `"${blockHazard}" in ${dirty.join(", ")} breaks the ^${blockMode === "tb" ? "TB" : "FB"} block`,
        ));
      }
    }
    markerValueCache.set(leaf, { ...deps, findings });
    out.push(...findings);
  }
  return out;
}

/** Current preflight findings for a page's leaves. Pass the EXPORTABLE leaves
 *  (includeInExport, not editor visibility) so the warnings track what actually
 *  prints. Pure projection of the document, recomputed as geometry and measured
 *  footprints settle. Runs the geometry (off-label) producer plus each type's
 *  own `preflight` producer (block-too-narrow, barcode module too small). */
export function computePreflight(
  leaves: readonly LeafObject[],
  ctx: ObjectBoundsCtx,
): PreflightFinding[] {
  const findings: PreflightFinding[] = [];
  for (const leaf of leaves) {
    const box = objectBoundsDots(leaf, ctx);
    const placement = offLabelPlacement(emittedAnchorDots(leaf, ctx, box), box, ctx.label);
    const kind =
      placement === "outside" ? "offLabelOutside" : placement === "clipped" ? "offLabelClipped" : null;
    if (kind) findings.push({ objectId: leaf.id, kind, severity: PREFLIGHT_SEVERITY[kind] });

    const produce = getEntry(leaf.type)?.preflight;
    if (produce) {
      for (const r of produce(leaf, { label: ctx.label })) {
        findings.push({ objectId: leaf.id, kind: r.kind, severity: PREFLIGHT_SEVERITY[r.kind], detail: r.detail });
      }
    }

    // Cross-cutting: any content-bearing field (text, every barcode) can carry
    // invisible/ambiguous chars smuggled in via scan or foreign-tool import, so
    // check here once instead of duplicating the producer across every type.
    const content = (leaf.props as { content?: unknown }).content;
    if (typeof content === "string") {
      // GS1 fields carry a structural GS separator (0x1D) between chained AIs;
      // it's intentional, not smuggled, so drop it before the scan.
      const scanned = (leaf.props as { gs1?: boolean }).gs1
        ? content.split(GS1_GS).join("")
        : content;
      const detail = suspiciousCharDetail(scanned);
      if (detail) {
        findings.push({
          objectId: leaf.id,
          kind: "suspiciousChars",
          severity: PREFLIGHT_SEVERITY.suspiciousChars,
          detail,
        });
      }
    }
  }
  return findings;
}
