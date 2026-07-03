import type { LeafObject } from "../../registry";
import { PREFLIGHT_SEVERITY, type PreflightFinding } from "../../lib/preflight";
import type { Variable } from "../../types/Variable";
import {
  applyBindingToObject,
  getObjectStringContent,
  type ActiveCsvRow,
  type ClockResolveCtx,
} from "../../lib/variableBinding";
import { renderBarcodeCanvas } from "./bwipHelpers";

/** Binding context so the check encodes what PRINTS: `«marker»` content is
 *  resolved exactly like the canvas preview. Encoding the raw marker text
 *  would flag valid payloads (e.g. a GS1 fixed AI filled by a variable) as
 *  too long. */
export interface EncodeEnv {
  variables: readonly Variable[];
  active: ActiveCsvRow | null;
  clock?: ClockResolveCtx;
}

// Cache encode verdicts per object identity (the store is identity-
// preserving). The RESOLVED content string is the binding-sensitive key: a
// marker-free barcode stays stable across unrelated variable/CSV/clock edits,
// a marker barcode re-encodes exactly when its substituted payload changes.
const encodeCache = new WeakMap<
  LeafObject,
  { scale: number; dpmm: number; content: string; error: string | null }
>();

function cachedEncodeError(
  leaf: LeafObject,
  scale: number,
  dpmm: number,
  env: EncodeEnv,
): string | null {
  const resolved = resolveForEncode(leaf, env);
  const content = getObjectStringContent(resolved) ?? "";
  const hit = encodeCache.get(leaf);
  if (hit && hit.scale === scale && hit.dpmm === dpmm && hit.content === content) {
    return hit.error;
  }
  const error = renderBarcodeCanvas(resolved, scale, dpmm).error;
  encodeCache.set(leaf, { scale, dpmm, content, error });
  return error;
}

/** Preview-resolved leaf for the encoder (identity-preserving when unbound). */
export function resolveForEncode(leaf: LeafObject, env: EncodeEnv): LeafObject {
  return applyBindingToObject(leaf, env.variables, env.active, "preview", env.clock);
}

/** Encode check over ALL exportable leaves, not just rendered ones, so a
 *  hidden-but-exported barcode with an uncodable payload (QR overflow, invalid
 *  EAN, ...) still badges. Lives at the canvas layer because the encoder does.
 *  `encodeError` is injectable so the mapping is testable without the encoder. */
export function barcodeEncodeFindings(
  leaves: readonly LeafObject[],
  scale: number,
  dpmm: number,
  env: EncodeEnv,
  encodeError: (leaf: LeafObject) => string | null = (leaf) =>
    cachedEncodeError(leaf, scale, dpmm, env),
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
