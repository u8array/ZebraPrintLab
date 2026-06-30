import type { LeafObject } from "../../registry";
import { PREFLIGHT_SEVERITY, type PreflightFinding } from "../../lib/preflight";
import { renderBarcodeCanvas } from "./bwipHelpers";

// Cache the encode verdict per object identity. The store is identity-preserving,
// so an unedited barcode keeps its reference and is not re-encoded when a
// sibling changes (editing one object would otherwise re-encode the whole page).
const encodeCache = new WeakMap<LeafObject, { scale: number; dpmm: number; error: string | null }>();

function cachedEncodeError(leaf: LeafObject, scale: number, dpmm: number): string | null {
  const hit = encodeCache.get(leaf);
  if (hit && hit.scale === scale && hit.dpmm === dpmm) return hit.error;
  const error = renderBarcodeCanvas(leaf, scale, dpmm).error;
  encodeCache.set(leaf, { scale, dpmm, error });
  return error;
}

/** Encode check over ALL exportable leaves, not just rendered ones, so a
 *  hidden-but-exported barcode with an uncodable payload (QR overflow, invalid
 *  EAN, ...) still badges. Lives at the canvas layer because the encoder does.
 *  `encodeError` is injectable so the mapping is testable without the encoder. */
export function barcodeEncodeFindings(
  leaves: readonly LeafObject[],
  scale: number,
  dpmm: number,
  encodeError: (leaf: LeafObject) => string | null = (leaf) => cachedEncodeError(leaf, scale, dpmm),
): PreflightFinding[] {
  const findings: PreflightFinding[] = [];
  for (const leaf of leaves) {
    const error = encodeError(leaf);
    if (error) {
      findings.push({ objectId: leaf.id, kind: "renderFailed", severity: PREFLIGHT_SEVERITY.renderFailed, detail: error });
    }
  }
  return findings;
}
