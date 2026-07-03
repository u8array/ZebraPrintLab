import type { LabelConfig } from './LabelConfig';

export type PreflightSeverity = 'error' | 'warning';

/** Distinct preflight problem kinds. Producers: geometry (off-label), render
 *  (encode failure), and per-type pure checks (block-too-narrow, barcode module
 *  too small). Each new producer adds its kind here. */
export type PreflightKind =
  | 'offLabelOutside'
  | 'offLabelClipped'
  | 'renderFailed'
  | 'blockTooNarrow'
  | 'barcodeTooSmall'
  | 'textOverset'
  | 'imageMissing'
  | 'suspiciousChars'
  | 'markerValueUnsafe'
  | 'gs1ValueInvalid';

export interface PreflightFinding {
  objectId: string;
  kind: PreflightKind;
  severity: PreflightSeverity;
  /** Optional human-readable specifics (encoder message, measured value),
   *  shown after the kind label in the badge list. */
  detail?: string;
}

/** Single source for kind -> severity so canvas styling and badge tiering can't
 *  drift apart. */
export const PREFLIGHT_SEVERITY: Record<PreflightKind, PreflightSeverity> = {
  offLabelOutside: 'error',
  offLabelClipped: 'warning',
  renderFailed: 'error',
  blockTooNarrow: 'error',
  barcodeTooSmall: 'warning',
  textOverset: 'warning',
  // Warning, not error like blockTooNarrow, although both print blank: image
  // bytes may still be hydrating from storage, so the state can self-resolve.
  imageMissing: 'warning',
  // Invisible/ambiguous chars still encode fine; they just rarely belong, so
  // warn (the payload may scan into unexpected data) rather than block.
  suspiciousChars: 'warning',
  // Same tier: the barcode encodes, but the marker's print-time value carries
  // structural chars its typed encoding can't take, so it scans corrupted.
  markerValueUnsafe: 'warning',
  // Split from markerValueUnsafe: not a scan-corruption but GS1-INVALID data
  // (wrong fixed-AI width, charset, date) from a substitution; it still
  // prints, so warn rather than block.
  gs1ValueInvalid: 'warning',
};

/** What a per-type `preflight` producer receives. Minimal on purpose (just the
 *  label, for dpmm) so the registry capability stays free of the lib-layer
 *  ObjectBoundsCtx and its import cycle. */
export interface PreflightCtx {
  label: LabelConfig;
}

/** A per-type producer's output: kind plus optional detail. computePreflight
 *  stamps the objectId and derives severity from PREFLIGHT_SEVERITY. */
export interface PreflightProducerResult {
  kind: PreflightKind;
  detail?: string;
}
