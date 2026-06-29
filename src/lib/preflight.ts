import type { LeafObject } from "../registry";
import { objectBoundsDots, offLabelPlacement, type ObjectBoundsCtx } from "./objectBounds";
import { emittedAnchorDots } from "./emittedAnchor";

export type PreflightSeverity = "error" | "warning";

/** Distinct preflight problem kinds. Off-label is the first producer; further
 *  producers (approx render, ...) add their own kinds here. */
export type PreflightKind = "offLabelOutside" | "offLabelClipped";

export interface PreflightFinding {
  objectId: string;
  kind: PreflightKind;
  severity: PreflightSeverity;
}

/** Single source for kind -> severity so canvas styling and the badge tiering
 *  can't drift apart. */
export const PREFLIGHT_SEVERITY: Record<PreflightKind, PreflightSeverity> = {
  offLabelOutside: "error",
  offLabelClipped: "warning",
};

/** Current preflight findings for a page's leaves. Pass the EXPORTABLE leaves
 *  (includeInExport, not editor visibility) so the warnings track what actually
 *  prints. Pure projection of the document, recomputed as geometry and measured
 *  footprints settle. A negative emitted origin maps to the hard
 *  `offLabelOutside`; a right/bottom overflow stays the softer `offLabelClipped`
 *  (see {@link offLabelPlacement}). */
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
  }
  return findings;
}
