import { DEFAULT_CLOCK_CHARS, isDefaultClockChars } from "./fcTemplate";
import { parseLabelMetaComment, type LabelMeta } from "./zplLabelMeta";
import { tokenize } from "./zplParser/helpers";
import { createParserState } from "./zplParser/context";
import { createFlushField } from "./zplParser/flushField";
import { createBarcodeHandlers } from "./zplParser/handlers/barcodes";
import { createDynamicFontAWildcard, createFieldHandlers } from "./zplParser/handlers/fields";
import { createGraphicsHandlers } from "./zplParser/handlers/graphics";
import { createLabelConfigHandlers } from "./zplParser/handlers/labelConfig";
import { createSetupScriptHandlers } from "./zplParser/handlers/setupScript";
import { createUnitsHandler } from "./zplParser/handlers/units";
import { createUnsupportedHandlers } from "./zplParser/handlers/unsupported";
import { buildBlockOverlay, type LinkedSpan } from "./zplOverlay/overlay";
import type {
  Handler,
  ImportFinding,
  ParsedZPL,
  Wildcard,
} from "./zplParser/types";
export type {
  ImportFindingKind,
  ImportFinding,
  ImportReport,
  ParsedZPL,
} from "./zplParser/types";

/** Barcode object types whose module width comes from ^BY (mirrors the
 *  `s.defaults.byModuleWidth` consumers in flushField). 2D codes that carry
 *  their own magnification (qrcode/datamatrix/aztec/maxicode) are excluded, so
 *  editing a 2D-code label stays regenSafe. */
export const BY_CONSUMING_BARCODE_TYPES = new Set<string>([
  "code128", "code39", "ean13", "upce", "upca", "ean8", "interleaved2of5",
  "code93", "code11", "industrial2of5", "standard2of5", "codabar", "logmars",
  "msi", "plessey", "planet", "postal", "upcEanExtension", "gs1databar",
  "pdf417", "code49", "micropdf417", "codablock", "tlc39",
]);

/** Parse a ZPL II byte stream into an editable design model. `captureOverlay`
 *  builds a source-patch overlay (segments linking each object to its bytes;
 *  gaps preserved as raw) for byte-identical re-export. Off by default. */
export function parseZPL(
  zpl: string,
  dpmm = 8,
  opts: { captureOverlay?: boolean } = {},
): ParsedZPL {
  const s = createParserState();
  const tokens = tokenize(zpl, s.format);
  const {
    objects, labelConfig, printerProfile, variables,
    skipped, partialCmds, browserLimit, unknown, replayRisk,
  } = s.result;

  const takeComment = (): string | undefined => {
    const c = s.comment.pending;
    s.comment.pending = undefined;
    return c;
  };

  const graphicsFamily = createGraphicsHandlers(s, takeComment);
  const { commitPendingReverseBg, getReverseFlag } = graphicsFamily.helpers;
  const flushField = createFlushField(s, {
    commitPendingReverseBg,
    getReverseFlag,
    takeComment,
  });

  const resetComment: Handler = (_, rest) => {
    s.comment.pending = rest.trim() || undefined;
  };
  // Our geometry sidecar, consumed (not shown as an object comment) from the
  // leading slot only, so a stray body ^FX can't rewrite the label settings.
  // Holder object so the closure write survives TS flow narrowing.
  const labelMeta: { value: LabelMeta | null } = { value: null };
  // Multi-line ^FX before a field accumulate; XA/XZ reset at label boundaries.
  const appendComment: Handler = (_, rest) => {
    const next = rest.trim();
    if (!next) return;
    if (!labelMeta.value && objects.length === 0) {
      const meta = parseLabelMetaComment(next);
      if (meta) {
        labelMeta.value = meta;
        return;
      }
    }
    s.comment.pending = s.comment.pending ? `${s.comment.pending}\n${next}` : next;
  };

  const handlers: Record<string, Handler> = {
    XA: (p, rest, cmd) => {
      commitPendingReverseBg();
      s.format.embedChar = "#";
      s.format.clockChars = { ...DEFAULT_CLOCK_CHARS };
      resetComment(p, rest, cmd);
    },
    XZ(p, rest, cmd) {
      commitPendingReverseBg();
      resetComment(p, rest, cmd);
    },
  };

  Object.assign(handlers, createBarcodeHandlers(s));
  Object.assign(handlers, createFieldHandlers(s, { flushField, appendComment }));
  Object.assign(handlers, graphicsFamily.handlers);
  // Replay-risk = printer-config (Setup-Script) commands PLUS device-action
  // commands (calibration/reset/diagnostics/ZBI/pause) that change device or
  // queue state when the lossless overlay re-emits them on export. Setup keys
  // derive from the handler set; device actions are listed explicitly because
  // their noop handlers are mixed with design noops (^FV/^FM) that are NOT
  // replay-risk. Visible label settings (labelConfig: ^MD/^PR/^MM...) and ^DY
  // font uploads are intentionally excluded (the former are shown in the label
  // panel; a non-font ^DY surfaces as a browserLimit finding).
  const setupScriptHandlers = createSetupScriptHandlers(s);
  const replayRiskCodes = new Set([
    ...Object.keys(setupScriptHandlers),
    "JA", "JM", "JC", "JD", "JE", "JI", "JR", "PP",
  ]);
  Object.assign(handlers, setupScriptHandlers);
  Object.assign(handlers, createLabelConfigHandlers(s, dpmm));
  Object.assign(handlers, createUnitsHandler(s, dpmm));
  Object.assign(handlers, createUnsupportedHandlers(s.result));

  // Wildcard handlers are tried only after exact-match dispatch fails,
  // so a handler-table entry always wins over a pattern-match.
  const wildcards: Wildcard[] = [createDynamicFontAWildcard(s)];

  // Overlay capture: a field runs ^FO/^FT … ^FS. `ovStart` is the field's source
  // start (^FO/^FT), `ovBase` the object count when the field opened; a deferred
  // reverse-bg that commits mid-field bumps `ovBase` so the field's own object is
  // still found at `ovBase`. Linking is intentionally conservative: only clean
  // single-object fields, deferred reverse-bg boxes, and reverse-collapse merges
  // are linked. Any other shape leaves an object unlinked, which trips the
  // all-linked gate below and drops the overlay so the block regenerates.
  const overlaySpans: LinkedSpan[] = [];
  const linkedIds = new Set<string>();
  let ovStart: number | null = null;
  let ovBase = 0;
  const linkObject = (start: number, end: number, objectId: string) => {
    overlaySpans.push({ start, end, link: { kind: "object", objectId } });
    linkedIds.add(objectId);
  };
  // Running state that would re-interpret a regenerated object's bytes on
  // replay (the raw command persists in a raw segment). Verbatim replay is
  // unaffected; only the dirty/new regeneration path cares. Tracked once per
  // block; drives the overlay's regenSafe flag.
  let regenHostileFormat = false;
  let sawNonUtf8Ci = false;
  let sawBareBarcode = false;
  let sawFnDeclaration = false;
  // Start of a contiguous leading-comment (^FX) run immediately before a field,
  // so the field's span can own its ^FX bytes (uniform verbatim/regen, and a
  // comment edit regenerates without leaving a stale ^FX in a raw segment).
  let commentStart: number | null = null;

  for (const { cmd, rest, start } of tokens) {
    const p = rest.split(s.format.delimiterChar);
    // Flag printer-config commands: lossless replay re-emits them, so they run
    // on the user's printer at print/export. Recorded by code (deduped later).
    if (replayRiskCodes.has(cmd)) replayRisk.push(`^${cmd}`);
    const handler = handlers[cmd] ?? wildcards.find((w) => w.matches(cmd))?.handle;
    if (handler) {
      const reverseBefore = s.reverseBg;
      const beforeLen = objects.length;
      handler(p, rest, cmd);
      if (opts.captureOverlay) {
        if (
          s.format.caretChar !== "^" ||
          s.format.tildeChar !== "~" ||
          s.format.delimiterChar !== "," ||
          s.format.unitScale !== 1 ||
          s.format.embedChar !== "#" ||
          // ^LR reverses every following field and is never re-emitted, so a
          // regenerated field under a surviving raw ^LR would double-reverse.
          s.label.lrActive ||
          // A non-default ^FC sets the active clock chars; a regenerated clock
          // field re-derives default chars and would mis-clock under the raw ^FC.
          !isDefaultClockChars(s.format.clockChars)
        ) {
          regenHostileFormat = true;
        }
        // Any non-UTF-8 ^CI makes regen unsafe: a regenerated field emits UTF-8
        // bytes that the surviving raw ^CI would mis-decode (the generator emits
        // ^CI28 only on the full-regen fallback, not in the overlay path).
        if (s.format.fhDecoder.encoding !== "utf-8") sawNonUtf8Ci = true;
        // A bare ^FN declaration (^FN outside an ^FO…^FS field) becomes a raw
        // segment; the scoped header would re-emit it on regen and duplicate it.
        if (cmd === "FN" && ovStart === null) sawFnDeclaration = true;
        // Track the leading-comment run; a non-^FX command (other than the field
        // opener) breaks contiguity so the span won't swallow intervening config.
        // Known limitation: when a command separates a ^FX from its field, the
        // ^FX stays in a raw segment; editing that field re-emits the comment,
        // producing a duplicate ^FX in the output. Harmless (comments do not
        // print) and rare, so accepted rather than tracked per-object.
        if (cmd === "FX") {
          if (commentStart === null) commentStart = start;
        } else if (cmd !== "FO" && cmd !== "FT") {
          commentStart = null;
        }
        // A prior stashed reverse-bg committed standalone on this (non-^FS)
        // token (graphics command, ^XA/^XZ): commitPendingReverseBg pushes the
        // box first, so objects[beforeLen] is it. ^FS is handled below instead.
        if (
          cmd !== "FS" &&
          reverseBefore?.span &&
          s.reverseBg !== reverseBefore &&
          objects.length > beforeLen
        ) {
          const box = objects[beforeLen];
          if (box) linkObject(reverseBefore.span.start, reverseBefore.span.end, box.id);
          if (ovStart !== null) ovBase++;
        }
        if (cmd === "FO" || cmd === "FT") {
          ovStart = commentStart ?? start;
          ovBase = objects.length;
          commentStart = null;
        } else if (cmd === "FS" && ovStart !== null) {
          const fieldEnd = start + 3;
          // A ^BY-consuming barcode whose ^BY sits outside its own field would
          // inherit a regenerated neighbour's inline ^BY on replay; mark the
          // block unsafe. Classify by the parsed object type (not a regex) so
          // 2D codes that ignore ^BY (QR/DataMatrix/Aztec/MaxiCode) stay
          // regenSafe. The field's own object is the last one pushed.
          const own = objects.length > ovBase ? objects[objects.length - 1] : undefined;
          if (
            own &&
            BY_CONSUMING_BARCODE_TYPES.has(own.type) &&
            !/\^BY/i.test(zpl.slice(ovStart, fieldEnd))
          ) {
            sawBareBarcode = true;
          }
          if (s.reverseBg && s.reverseBg.span === undefined && objects.length === ovBase) {
            // This field stashed a reverse-bg (no object yet); record its span
            // so the box can be linked when it commits later.
            s.reverseBg.span = { start: ovStart, end: fieldEnd };
          } else if (reverseBefore?.span && s.reverseBg === null && objects.length === ovBase + 1) {
            // Reverse-collapse: stashed box + this ^FR text merged into one
            // object spanning both fields (the gap rides along in the segment).
            const merged = objects[ovBase];
            if (merged) linkObject(reverseBefore.span.start, fieldEnd, merged.id);
          } else if (reverseBefore?.span && s.reverseBg === null && objects.length === ovBase + 2) {
            // Stashed box committed standalone during this flush (box at ovBase),
            // then the field's own object (text/barcode) at ovBase+1.
            const box = objects[ovBase];
            const own = objects[ovBase + 1];
            if (box) linkObject(reverseBefore.span.start, reverseBefore.span.end, box.id);
            if (own) linkObject(ovStart, fieldEnd, own.id);
          } else if (objects.length === ovBase + 1) {
            // Clean single-object field.
            const obj = objects[ovBase];
            if (obj) linkObject(ovStart, fieldEnd, obj.id);
          }
          ovStart = null;
        }
      }
      continue;
    }

    if (rest.trim() || cmd.trim()) {
      const token = `^${cmd}${rest}`;
      skipped.push(token);
      unknown.push(token);
    }
  }

  // Build the overlay only when every parsed object linked to a source span;
  // an unlinked object would double-emit (raw replay + model regenerate), so a
  // partial capture is unsafe. Falls back to model regeneration for the block.
  const allLinked = objects.every((o) => linkedIds.has(o.id));
  const regenSafe =
    !regenHostileFormat && !sawNonUtf8Ci && !sawBareBarcode && !sawFnDeclaration;
  const frame =
    s.label.lhX !== 0 || s.label.lhY !== 0 || s.label.ltY !== 0
      ? { homeX: s.label.lhX, homeY: s.label.lhY, top: s.label.ltY }
      : undefined;
  // buildBlockOverlay throws on overlapping/out-of-bounds spans (a broken span
  // invariant). Today that is unreachable; catching keeps the contract total
  // (any capture problem drops the overlay rather than crashing import) and the
  // warn surfaces the parser bug should a future change ever make it reachable.
  let overlay: ParsedZPL["overlay"];
  if (opts.captureOverlay && allLinked) {
    try {
      overlay = buildBlockOverlay(zpl, overlaySpans, { regenSafe, frame });
    } catch (err) {
      console.warn("buildBlockOverlay failed, dropping overlay for this block", err);
      overlay = undefined;
    }
  }

  // Apply the geometry sidecar last so it wins over ^PW/^LL-derived mm and
  // restores dpmm, which plain ZPL can't carry.
  if (labelMeta.value) {
    labelConfig.dpmm = labelMeta.value.dpmm;
    labelConfig.widthMm = labelMeta.value.widthMm;
    labelConfig.heightMm = labelMeta.value.heightMm;
  }

  // pageIndex stays 0; zplImportService fills it per ^XA…^XZ block.
  const findings: ImportFinding[] = [
    ...[...partialCmds].map(
      (command): ImportFinding => ({ kind: "partial", command, pageIndex: 0 }),
    ),
    ...browserLimit.map(
      (command): ImportFinding => ({
        kind: "browserLimit",
        command,
        pageIndex: 0,
      }),
    ),
    ...unknown.map(
      (command): ImportFinding => ({ kind: "unknown", command, pageIndex: 0 }),
    ),
    ...replayRisk.map(
      (command): ImportFinding => ({ kind: "replayRisk", command, pageIndex: 0 }),
    ),
  ];

  return {
    labelConfig,
    printerProfile,
    objects,
    variables,
    uploadedFontPaths: [...s.fonts.downloadedFontPaths],
    referencedFontPaths: [...s.fonts.referencedFontPaths],
    skipped,
    importReport: {
      findings,
      partial: [...partialCmds],
      browserLimit,
      unknown,
      replayRisk,
    },
    overlay,
  };
}
