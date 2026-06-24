// Round-trip overlay: one ^XA…^XZ block sliced into ordered segments whose
// texts concatenate back to the original source. On export, segments re-emit
// verbatim unless their linked model entity was edited/removed, so everything
// untouched (fields, config, comments, unmodeled commands, whitespace, order)
// stays byte-identical. The source is not stored: it equals the segment texts
// joined (see overlayText), so keeping it would duplicate every byte (including
// large ^GF/~DY graphic payloads) in persistence and every undo snapshot.

import { z } from "zod";

/** Key identifying a labelConfig/printerProfile field a config command sets.
 *  Refined to a union as config linkage lands (later stage); string for now. */
export type ConfigFieldKey = string;

export type OverlaySegment =
  | { kind: "raw"; text: string }
  | { kind: "object"; objectId: string; text: string }
  | { kind: "config"; field: ConfigFieldKey; text: string };

/** Folded label-home/top (^LH/^LT) of the block. Regenerated objects must be
 *  emitted relative to this, because the raw ^LH/^LT commands still execute on
 *  replay and would otherwise double-shift a model-absolute coordinate. */
export interface OverlayFrame {
  homeX: number;
  homeY: number;
  top: number;
}

export interface BlockOverlay {
  /** Ordered segments covering the whole block; their texts joined reproduce
   *  the original source byte-for-byte (incl. ^XA/^XZ and whitespace). */
  segments: OverlaySegment[];
  v: number;
  /** When false, a dirty/new object in this block cannot be regenerated in
   *  place because a surviving raw command would re-interpret its bytes
   *  (^MU unit scale, non-default ^CC/^CT/^CD prefix, non-UTF-8 ^CI with ^FH,
   *  non-default ^FE embed). Export then falls back to full regeneration the
   *  moment any edit exists; a zero-edit verbatim replay stays safe regardless. */
  regenSafe: boolean;
  /** Present only when ^LH/^LT moved the origin; absent means no shift. */
  frame?: OverlayFrame;
}

/** Overlay schema version; bump when segmentation changes so a stale persisted
 *  overlay can be detected and rebuilt instead of mis-replayed. */
export const OVERLAY_VERSION = 3;

/** A model-linked source span `[start, end)` within a block. */
export interface LinkedSpan {
  start: number;
  end: number;
  link: { kind: "object"; objectId: string } | { kind: "config"; field: ConfigFieldKey };
}

/** Slice `source` into segments: each linked span becomes an object/config
 *  segment and the gaps between them raw segments. Spans are sorted here; they
 *  must be in-bounds and non-overlapping. `regenSafe`/`frame` describe the
 *  block's running state for the export-time regeneration path. */
export function buildBlockOverlay(
  source: string,
  spans: readonly LinkedSpan[],
  opts: { regenSafe: boolean; frame?: OverlayFrame },
): BlockOverlay {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const segments: OverlaySegment[] = [];
  let cursor = 0;
  for (const span of sorted) {
    if (span.start < 0 || span.end > source.length || span.end < span.start)
      throw new Error(`overlay span out of bounds [${span.start},${span.end})`);
    if (span.start < cursor) throw new Error(`overlapping overlay span at ${span.start}`);
    if (span.start > cursor) segments.push({ kind: "raw", text: source.slice(cursor, span.start) });
    const text = source.slice(span.start, span.end);
    segments.push(
      span.link.kind === "object"
        ? { kind: "object", objectId: span.link.objectId, text }
        : { kind: "config", field: span.link.field, text },
    );
    cursor = span.end;
  }
  if (cursor < source.length) segments.push({ kind: "raw", text: source.slice(cursor) });
  const overlay: BlockOverlay = { segments, v: OVERLAY_VERSION, regenSafe: opts.regenSafe };
  if (opts.frame) overlay.frame = opts.frame;
  return overlay;
}

/** The block source, reconstructed by concatenating segment texts. */
export function overlayText(overlay: BlockOverlay): string {
  return overlay.segments.map((s) => s.text).join("");
}

/** True when the overlay's segmentation matches the current schema. A persisted
 *  overlay from an older version is rejected (consumers fall back to model
 *  regeneration) since its segment shape may no longer replay correctly. */
export function isOverlayConsistent(overlay: BlockOverlay): boolean {
  return overlay.v === OVERLAY_VERSION;
}

const overlaySegmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("raw"), text: z.string() }),
  z.object({ kind: z.literal("object"), objectId: z.string(), text: z.string() }),
  z.object({ kind: z.literal("config"), field: z.string(), text: z.string() }),
]);

/** Validates a persisted overlay. A stale-version or malformed value is rejected
 *  so it drops to regeneration instead of replaying mis-segmented bytes. */
export const blockOverlaySchema = z
  .object({
    segments: z.array(overlaySegmentSchema),
    v: z.number(),
    regenSafe: z.boolean(),
    frame: z
      .object({ homeX: z.number(), homeY: z.number(), top: z.number() })
      .optional(),
  })
  .refine(isOverlayConsistent);
