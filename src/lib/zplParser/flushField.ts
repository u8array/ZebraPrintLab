import {
  FN_NUMBER_MIN,
  FN_NUMBER_MAX,
  uniqueVariableName,
  isValidVariableName,
  markerOf,
  type Variable,
} from "../../types/Variable";
import { embedsToMarkers } from "../fnTemplate";
import { tokensToMarkers } from "../fcTemplate";
import { decodeFbContent } from "../fbContent";
import { decodeTbContent } from "../tbContent";
import { elementStringToContent } from "../gs1";
import { dataMatrixFdToGs1Content } from "../dataMatrixFd";
import { zplAnchorToModel } from "../labelGeometry/textPositionTransforms";
import { blockInterLineExtentDots } from "../zebraTextLayout";
import { computeTextRenderMetrics } from "../labelGeometry/textRenderMetrics";
import type { TextProps } from "../../registry/text";
import type { Code128Props } from "../../registry/code128";
import type { Code39Props } from "../../registry/code39";
import type { Ean13Props } from "../../registry/ean13";
import type { QrCodeProps } from "../../registry/qrcode";
import type { DataMatrixProps } from "../../registry/datamatrix";
import type { Barcode1DProps } from "../../registry/barcode1d";
import type { Gs1DatabarProps } from "../../registry/gs1databar";
import type { Pdf417Props } from "../../registry/pdf417";
import type { Code49Props } from "../../registry/code49";
import {
  DEFAULT_GS_SYMBOL,
  GS_SYMBOL_CODES,
  type SymbolProps,
} from "../../registry/symbol";
import { applySerialToLeaf } from "../../registry/serialField";
import { getEntry } from "../../registry";
import type { AztecProps } from "../../registry/aztec";
import type { MaxicodeProps } from "../../registry/maxicode";
import type { MicroPdf417Props } from "../../registry/micropdf417";
import type { CodablockProps } from "../../registry/codablock";
import type { Tlc39Props } from "../../registry/tlc39";
import { upceData6FromFd } from "../../registry/hriFormatters";
import { decodeFH, makeObj, variableNameFromComment } from "./helpers";
import { getPosType, type ParserState } from "./context";

/** Cross-family deps flushField borrows from graphics (^GB+^FR) and parseZPL (^FX). */
export interface FlushFieldDeps {
  commitPendingReverseBg: () => void;
  getReverseFlag: () => boolean | undefined;
  takeComment: () => string | undefined;
}

/** Field-emit closure: turns cached s.field into a pushed LabelObject at ^FS. */
export function createFlushField(
  s: ParserState,
  deps: FlushFieldDeps,
): () => void {
  const { commitPendingReverseBg, getReverseFlag, takeComment } = deps;
  const { objects, variables } = s.result;

  /** Find-or-create Variable for FN slot; silently backfills empty defaultValue. */
  const upsertVariable = (
    fnNumber: number,
    defaultValue: string,
    commentHint?: string,
  ): Variable => {
    const existing = variables.find((v) => v.fnNumber === fnNumber);
    if (existing) {
      if (!existing.defaultValue && defaultValue) {
        existing.defaultValue = defaultValue;
      }
      return existing;
    }
    // The ^FX hint is untrusted: reject marker-unsafe / reserved names (e.g.
    // `clock:Y`, `sku»oops`) so the content-marker model stays consistent.
    const hinted = variableNameFromComment(commentHint);
    const base = hinted && isValidVariableName(hinted) ? hinted : `field_${fnNumber}`;
    const v: Variable = {
      id: crypto.randomUUID(),
      name: uniqueVariableName(base, variables),
      fnNumber,
      defaultValue,
    };
    variables.push(v);
    return v;
  };

  // Bootstrap Variables for FNs referenced by embeds before marker substitution.
  const applyFnEmbeds = (payload: string): string => {
    // Closed `<e><n><e>` only; a naked `<e><digits>` would dangle phantom Variables.
    const e = s.format.embedChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const embedRe = new RegExp(`${e}(\\d+)(?:,[^${e}]*)?${e}`, "g");
    let m: RegExpExecArray | null;
    const seen = new Set<number>();
    while ((m = embedRe.exec(payload)) !== null) {
      if (!m[1]) continue;
      const n = parseInt(m[1], 10);
      if (n < FN_NUMBER_MIN || n > FN_NUMBER_MAX) continue;
      seen.add(n);
    }
    if (seen.size === 0) return payload;
    for (const n of seen) upsertVariable(n, "");
    const fnToName = new Map(variables.map((v) => [v.fnNumber, v.name]));
    return embedsToMarkers(payload, s.format.embedChar, fnToName);
  };

  const resetFB = () => {
    s.defaults.fbWidth = 0;
    s.defaults.fbLines = 1;
    s.defaults.fbSpacing = 0;
    s.defaults.fbJustify = "L";
    s.defaults.fbHangingIndent = 0;
    s.defaults.tbHeight = 0;
  };

  const flushField = () => {
    if (!s.field.fieldType || s.field.pendingFD === null) {
      // Bare `^FN<n>^FD<default>^FS`: Variable declaration, not a field.
      if (s.comment.fnNumber !== null && s.field.pendingFD !== null) {
        const decl = s.format.fhActive
          ? decodeFH(s.field.pendingFD, s.format.fhDelimiter, s.format.fhDecoder)
          : s.field.pendingFD;
        upsertVariable(s.comment.fnNumber, decl, s.comment.fnComment);
        s.bareDeclaredFns.add(s.comment.fnNumber);
        s.comment.fnNumber = null;
        s.comment.fnComment = undefined;
      }
      s.field.pendingFD = null;
      // Reset half-formed field (e.g. `^GS…^FS` without `^FD`) so kind doesn't leak.
      s.field.fieldType = null;
      return;
    }
    const rawDecoded = s.format.fhActive
      ? decodeFH(s.field.pendingFD, s.format.fhDelimiter, s.format.fhDecoder)
      : s.field.pendingFD;
    // FN embeds → markers, then ^FC clock tokens (order matters: `%FN#1#%Y`).
    const afterFn = applyFnEmbeds(rawDecoded);
    const content = tokensToMarkers(afterFn, s.format.clockChars);
    const posType = getPosType(s.field);
    const comment = takeComment();

    // Decode block payloads symmetric with the generator: ^TB unescapes
    // `<<>`, ^FB unescapes `\&`/`\-`/`\\`, plain text passes through.
    // Captured before resetFB so the ^FN bind below can pick the tb default.
    // Gated on the field actually being text: a malformed field that mixes ^TB
    // with a later barcode command leaves tbHeight set but flips fieldType, and
    // the bind block must then use raw content, not the tb-decoded value.
    const isTbField = s.defaults.tbHeight > 0 && s.field.fieldType === "text";
    const decoded = isTbField
      ? decodeTbContent(content)
      : s.defaults.fbWidth > 0
        ? decodeFbContent(content)
        : content;

    // Only text can pair with a stashed reverse-bg; non-text flushes first.
    if (s.field.fieldType !== "text") commitPendingReverseBg();
    switch (s.field.fieldType) {
      case "text": {
        // ZPL anchors ^FO at cap-top and ^FT at baseline; our internal
        // model stores the Konva render position (EM-top-left) so editor
        // interactions stay shift-free. The FO/I and FO/B shifts also
        // need the rendered ink width; measure it the same way the
        // renderer does so the round-trip stays exact.
        const { inkWidthDots } = computeTextRenderMetrics({
          content: decoded,
          fontHeight: s.field.textH,
          fontWidth: s.field.textW,
          printerFontName: s.field.pendingPrinterFontName,
        });
        // FT pins the last baseline, so the EM-top sits one block-extent above;
        // FO R/I stack the same way. ^TB is a fixed clip height, ^FB stacks
        // lines. Must match the generator's blockExtentFor for byte-exact
        // round-trips and matching WYSIWYG.
        const blockExtentDots =
          s.defaults.tbHeight > 0
            ? Math.max(0, s.defaults.tbHeight - s.field.textH)
            : blockInterLineExtentDots({
                blockWidthDots: s.defaults.fbWidth,
                blockLines: s.defaults.fbLines,
                blockLineSpacing: s.defaults.fbSpacing,
                fontHeight: s.field.textH,
              });
        const modelPos = zplAnchorToModel(
          s.field.x,
          s.field.y,
          { fontHeight: s.field.textH, rotation: s.field.textRot },
          posType,
          inkWidthDots,
          blockExtentDots,
          s.defaults.fbWidth,
        );
        // A stashed filled-black ^GB commits as its own box just before the
        // text, so it sits behind it; ^FR then knocks the glyph ink out of that
        // box at render time. We never merge the box into the text, so a hand
        // authored reverse label round-trips with its box and position type
        // intact.
        commitPendingReverseBg();
        const textProps: TextProps = {
          content: decoded,
          fontHeight: s.field.textH,
          fontWidth: s.field.textW,
          rotation: s.field.textRot,
          reverse: getReverseFlag(),
          printerFontName: s.field.pendingPrinterFontName,
          fontId: s.field.pendingFontId,
        };
        s.field.pendingPrinterFontName = undefined;
        s.field.pendingFontId = undefined;
        if (s.defaults.tbHeight > 0) {
          textProps.textMode = "tb";
          textProps.blockWidth = s.defaults.fbWidth;
          textProps.blockHeight = s.defaults.tbHeight;
        } else if (s.defaults.fbWidth > 0) {
          textProps.blockWidth = s.defaults.fbWidth;
          textProps.blockLines = s.defaults.fbLines;
          textProps.blockLineSpacing = s.defaults.fbSpacing;
          textProps.blockJustify = s.defaults.fbJustify;
          if (s.defaults.fbHangingIndent > 0) {
            textProps.blockHangingIndent = s.defaults.fbHangingIndent;
          }
        }
        if (s.field.fpDirection !== "H") {
          textProps.fpDirection = s.field.fpDirection;
        }
        if (s.field.fpCharGap > 0) {
          textProps.fpCharGap = s.field.fpCharGap;
        }
        objects.push(
          makeObj("text", modelPos.x, modelPos.y, textProps, posType, comment),
        );
        resetFB();
        break;
      }
      case "code128": {
        // GS1-128 (^BC…,D): store the canonical compact form, not the parens.
        const gs1 = s.field.bcGs1;
        objects.push(
          makeObj(
            "code128",
            s.field.x,
            s.field.y,
            {
              content: gs1 ? (elementStringToContent(content) ?? content) : content,
              height: s.field.bcHeight,
              moduleWidth: s.defaults.byModuleWidth,
              printInterpretation: s.field.bcInterp,
              printInterpretationAbove: s.field.bcInterpAbove,
              checkDigit: s.field.bcCheck,
              rotation: s.field.bcRotation,
              ...(gs1 ? { gs1: true } : {}),
            } satisfies Code128Props,
            posType,
            comment,
          ),
        );
        break;
      }
      case "code39":
        objects.push(
          makeObj(
            "code39",
            s.field.x,
            s.field.y,
            {
              content,
              height: s.field.bcHeight,
              moduleWidth: s.defaults.byModuleWidth,
              printInterpretation: s.field.bcInterp,
              printInterpretationAbove: s.field.bcInterpAbove,
              checkDigit: s.field.bcCheck,
              rotation: s.field.bcRotation,
            } satisfies Code39Props,
            posType,
            comment,
          ),
        );
        break;
      case "ean13":
        objects.push(
          makeObj(
            "ean13",
            s.field.x,
            s.field.y,
            {
              content,
              height: s.field.bcHeight,
              moduleWidth: s.defaults.byModuleWidth,
              printInterpretation: s.field.bcInterp,
              printInterpretationAbove: s.field.bcInterpAbove,
              checkDigit: false, // EAN-13 has no user-controlled check digit (^BE auto-appends).
              rotation: s.field.bcRotation,
            } satisfies Ean13Props,
            posType,
            comment,
          ),
        );
        break;
      case "qrcode": {
        // content format from toZPL: "{ec}A,{data}"  e.g. "QA,https://example.com"
        const ec = (content[0] ?? "Q") as QrCodeProps["errorCorrection"];
        const data = content.slice(3);
        objects.push(
          makeObj(
            "qrcode",
            s.field.x,
            s.field.y,
            {
              content: data,
              magnification: s.field.qrMag,
              errorCorrection: ec,
              // ^BQ b: only 1 and 2 are valid; anything else falls to 2.
              model: s.field.qrModel === 1 ? 1 : 2,
              rotation: s.field.bcRotation,
            } satisfies QrCodeProps,
            posType,
            comment,
          ),
        );
        break;
      }
      case "datamatrix": {
        // The ^BX escape param is honored only at quality 200, so GS1 mode is
        // valid only there; otherwise the field data is plain, kept verbatim.
        const esc = s.field.dmQuality === 200 ? s.field.dmEscape : undefined;
        const gs1Content = esc ? dataMatrixFdToGs1Content(content, esc) : null;
        objects.push(
          makeObj(
            "datamatrix",
            s.field.x,
            s.field.y,
            {
              content: gs1Content ?? content,
              dimension: s.field.dmDim,
              quality: s.field.dmQuality,
              rotation: s.field.bcRotation,
              gs1: gs1Content !== null,
              ...(s.field.dmAspect === 2 ? { aspectRatio: 2 as const } : {}),
              ...(s.field.dmCols ? { columns: s.field.dmCols } : {}),
              ...(s.field.dmRows ? { rows: s.field.dmRows } : {}),
            } satisfies DataMatrixProps,
            posType,
            comment,
          ),
        );
        break;
      }
      case "upce":
        objects.push(
          makeObj(
            "upce",
            s.field.x,
            s.field.y,
            {
              // ^B9 ^FD carries the number-system digit; store the 6 data
              // digits so re-emit re-adds it without double-prefixing.
              content: upceData6FromFd(content),
              height: s.field.bcHeight,
              moduleWidth: s.defaults.byModuleWidth,
              printInterpretation: s.field.bcInterp,
              printInterpretationAbove: s.field.bcInterpAbove,
              checkDigit: s.field.bcCheck,
              rotation: s.field.bcRotation,
            } satisfies Barcode1DProps,
            posType,
            comment,
          ),
        );
        break;
      case "upca":
      case "ean8":
      case "interleaved2of5":
      case "code93":
      case "code11":
      case "industrial2of5":
      case "standard2of5":
      case "codabar":
      case "logmars":
      case "msi":
      case "plessey":
      case "planet":
      case "postal":
      case "upcEanExtension":
        objects.push(
          makeObj(
            s.field.fieldType,
            s.field.x,
            s.field.y,
            {
              content,
              height: s.field.bcHeight,
              moduleWidth: s.defaults.byModuleWidth,
              printInterpretation: s.field.bcInterp,
              printInterpretationAbove: s.field.bcInterpAbove,
              checkDigit: s.field.bcCheck,
              rotation: s.field.bcRotation,
            } satisfies Barcode1DProps,
            posType,
            comment,
          ),
        );
        break;
      case "gs1databar":
        objects.push(
          makeObj(
            "gs1databar",
            s.field.x,
            s.field.y,
            {
              content,
              // ^BR p[2] is the authoritative magnification source;
              // fall back to ^BY moduleWidth when ^BR omitted p[2]
              // (Zebra convention: ^BY and ^BR magnification match).
              magnification: s.field.gsMagnification ?? s.defaults.byModuleWidth,
              symbology: s.field.gsSymbology,
              segments: s.field.gsSegments,
              rotation: s.field.bcRotation,
            } satisfies Gs1DatabarProps,
            posType,
            comment,
          ),
        );
        break;
      case "pdf417":
        objects.push(
          makeObj(
            "pdf417",
            s.field.x,
            s.field.y,
            {
              content,
              rowHeight: s.field.pdfRowHeight,
              securityLevel: s.field.pdfSecurity,
              columns: s.field.pdfColumns,
              moduleWidth: s.defaults.byModuleWidth,
              rotation: s.field.bcRotation,
            } satisfies Pdf417Props,
            posType,
            comment,
          ),
        );
        break;
      case "code49":
        objects.push(
          makeObj(
            "code49",
            s.field.x,
            s.field.y,
            {
              content,
              height: s.field.bcHeight,
              moduleWidth: s.defaults.byModuleWidth,
              printInterpretation: s.field.bcInterp,
              mode: s.field.bcCode49Mode,
              rotation: s.field.bcRotation,
            } satisfies Code49Props,
            posType,
            comment,
          ),
        );
        break;
      case "aztec":
        objects.push(
          makeObj(
            "aztec",
            s.field.x,
            s.field.y,
            {
              content,
              magnification: s.field.aztecMag,
              ecLevel: 0,
              rotation: s.field.bcRotation,
            } satisfies AztecProps,
            posType,
            comment,
          ),
        );
        break;
      case "maxicode":
        objects.push(
          makeObj(
            "maxicode",
            s.field.x,
            s.field.y,
            {
              content,
              mode: s.field.maxicodeMode,
              rotation: s.field.bcRotation,
            } satisfies MaxicodeProps,
            posType,
            comment,
          ),
        );
        break;
      case "micropdf417":
        objects.push(
          makeObj(
            "micropdf417",
            s.field.x,
            s.field.y,
            {
              content,
              moduleWidth: s.defaults.byModuleWidth,
              rowHeight: s.field.mpdfRowHeight,
              mode: 0,
              rotation: s.field.bcRotation,
            } satisfies MicroPdf417Props,
            posType,
            comment,
          ),
        );
        break;
      case "codablock":
        objects.push(
          makeObj(
            "codablock",
            s.field.x,
            s.field.y,
            {
              content,
              moduleWidth: s.defaults.byModuleWidth,
              rowHeight: s.field.cbRowHeight,
              columns: s.field.cbColumns,
              securityLevel: s.field.cbSecurity,
              rotation: s.field.bcRotation,
            } satisfies CodablockProps,
            posType,
            comment,
          ),
        );
        break;
      case "tlc39":
        objects.push(
          makeObj(
            "tlc39",
            s.field.x,
            s.field.y,
            {
              content,
              moduleWidth: s.field.tlcModuleWidth ?? s.defaults.byModuleWidth,
              height: s.field.tlcHeight,
              microPdfRowHeight: s.field.tlcMicroPdfRowHeight,
              microPdfRows: s.field.tlcMicroPdfRows,
              rotation: s.field.bcRotation,
            } satisfies Tlc39Props,
            posType,
            comment,
          ),
        );
        break;
      case "symbol": {
        // ^GS payload is a single letter A..E selecting the glyph.
        // Anything else falls back to DEFAULT_GS_SYMBOL so a malformed
        // import still produces a sensible visible object.
        const raw = content.trim().charAt(0).toUpperCase();
        const code = (GS_SYMBOL_CODES.has(raw) ? raw : DEFAULT_GS_SYMBOL) as SymbolProps["symbol"];
        objects.push(
          makeObj(
            "symbol",
            s.field.x,
            s.field.y,
            {
              symbol: code,
              height: s.field.symH,
              width: s.field.symW,
              rotation: s.field.symRot,
            } satisfies SymbolProps,
            posType,
            comment,
          ),
        );
        break;
      }
    }

    // The just-pushed leaf and whether its emitter honours ^SN/^SF: derived once,
    // consumed by both the ^FN-bind and the ^SN/^SF blocks below.
    const justPushed = objects[objects.length - 1];
    const lastSerialisable = !!justPushed && !!getEntry(justPushed.type)?.serialisable;

    // Bind pending ^FN slot; existing Variable for same fnNumber is reused.
    if (s.comment.fnNumber !== null) {
      if (justPushed) {
        // ^TB encodes the bound default (`<<>`), so store the decoded plain
        // value to stay symmetric with the generator; ^FB/plain keep content.
        const varDefault = isTbField ? decoded : content;
        const variable = upsertVariable(s.comment.fnNumber, varDefault, s.comment.fnComment);
        // Serial wins over the binding, but only when actually applied
        // (serialisable type); else a 2D field's ^FN binding would be silently
        // dropped. The upsert still runs: the slot is shared, so a later field
        // or embed may reference it and must see this default. If none does,
        // the end-of-parse sweep drops the orphan.
        const serialApplied = s.field.snPending && lastSerialisable;
        if (serialApplied) {
          s.serialStrippedFns.add(s.comment.fnNumber);
        } else {
          // Field links to its variable via a single «name» marker (single-bind
          // on emit), not a stored variableId.
          const leaf = justPushed as { props?: { content?: string } };
          if (leaf.props) leaf.props.content = markerOf(variable.name);
        }
      }
      s.comment.fnNumber = null;
      s.comment.fnComment = undefined;
    }

    // ^SN/^SF: flag the just-pushed field as a serial counter, but only for
    // types whose emitter actually emits ^SN/^SF (text + 1D). Attaching it to a
    // 2D/stacked field would import a state the emitter drops on export. The
    // in-field ^SN/^SF set snPending, consumed once here. Runs after the
    // ^FN-bind block so applySerialToLeaf can clear a binding the same field
    // also declared.
    if (s.field.snPending) {
      if (justPushed && lastSerialisable) {
        applySerialToLeaf(justPushed, {
          increment: s.field.snIncrement,
          zplMode: s.field.snMode,
        });
      }
      s.field.snPending = false;
      s.field.snIncrement = 1;
      s.field.snMode = "SN";
    }

    s.field.fieldType = null;
    s.field.pendingFD = null;
    s.field.frActive = false;
  };

  return flushField;
}
