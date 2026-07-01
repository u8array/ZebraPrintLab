import { getEntry, type LeafObject } from "../registry";
import { objectBoundsDots, offLabelPlacement, type ObjectBoundsCtx } from "./objectBounds";
import { emittedAnchorDots } from "./emittedAnchor";
import { suspiciousCharDetail } from "./suspiciousChars";
import {
  PREFLIGHT_SEVERITY,
  type PreflightFinding,
  type PreflightKind,
  type PreflightSeverity,
} from "../types/preflight";

export { PREFLIGHT_SEVERITY };
export type { PreflightFinding, PreflightKind, PreflightSeverity };

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
      const detail = suspiciousCharDetail(content);
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
