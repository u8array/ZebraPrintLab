import {
  FN_NUMBER_MIN,
  FN_NUMBER_MAX,
  uniqueVariableName,
  type Variable,
} from "../../types/Variable";
import { embedsToMarkers } from "../fnTemplate";
import { tokensToMarkers } from "../fcTemplate";
import { decodeFbContent } from "../fbContent";
import { decodeTbContent } from "../tbContent";
import { dataMatrixFdToGs1Content } from "../gs1";
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
import type { SerialProps } from "../../registry/serial";
import type { AztecProps } from "../../registry/aztec";
import type { MaxicodeProps } from "../../registry/maxicode";
import type { MicroPdf417Props } from "../../registry/micropdf417";
import type { CodablockProps } from "../../registry/codablock";
import type { Tlc39Props } from "../../registry/tlc39";
import { upceData6FromFd } from "../../registry/hriFormatters";
import { decodeFH, makeObj, variableNameFromComment } from "./helpers";
import { getPosType, type ParserState, REVERSE_BBOX_TOLERANCE_DOTS } from "./context";

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
    const base = variableNameFromComment(commentHint) ?? `field_${fnNumber}`;
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
          content: s.field.snPending ? `#${decoded}` : decoded,
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
        // ^SF pending: emit serial (not text); flush any reverse-bg first.
        if (s.field.snPending) {
          commitPendingReverseBg();
          objects.push(
            makeObj(
              "serial",
              modelPos.x,
              modelPos.y,
              {
                content: decoded,
                increment: s.field.snIncrement,
                fontHeight: s.field.textH,
                fontWidth: s.field.textW,
                rotation: s.field.textRot,
                zplMode: s.field.snMode,
              } satisfies SerialProps,
              posType,
              comment,
            ),
          );
          // Consumed: clear pending serial state immediately so a
          // following field inside the same ^FS block emits as text.
          s.field.snPending = false;
          s.field.snIncrement = 1;
          s.field.snMode = "SN";
          resetFB();
          break;
        }
        // Reverse-text collapse: stashed filled ^GB + ^FR text at same anchor
        // with matching bbox → single reverse-text. Otherwise the bg flushes
        // as a normal box (unrelated ^GB+^FR sequences round-trip unchanged).
        // ^FB blocks knock out the whole block area; the box then matches
        // blockWidth x (textH + inter-line extent), with the R/B axis swap.
        const vertical = s.field.textRot === "R" || s.field.textRot === "B";
        const blockBaseW =
          s.defaults.fbWidth > 0
            ? s.defaults.fbWidth
            : Math.max(1, Math.round(inkWidthDots));
        // ^TB knockout height is the raw clip height (matches the generator's
        // ^GB), not textH + extent which floors at textH for tbHeight < textH.
        const blockBaseH =
          s.defaults.tbHeight > 0
            ? s.defaults.tbHeight
            : s.defaults.fbWidth > 0
              ? s.field.textH + blockExtentDots
              : s.field.textH;
        const expectedW = vertical ? blockBaseH : blockBaseW;
        const expectedH = vertical ? blockBaseW : blockBaseH;
        const collapse =
          s.reverseBg !== null &&
          s.field.frActive &&
          s.reverseBg.x === s.field.x &&
          s.reverseBg.y === s.field.y &&
          Math.abs(s.reverseBg.w - expectedW) <= REVERSE_BBOX_TOLERANCE_DOTS &&
          Math.abs(s.reverseBg.h - expectedH) <= REVERSE_BBOX_TOLERANCE_DOTS;
        // Merge any ^FX banner that was attached to the stashed ^GB.
        let mergedComment = comment;
        if (collapse) {
          const bgComment = s.reverseBg?.comment;
          if (bgComment) {
            mergedComment = mergedComment ? `${bgComment}\n${mergedComment}` : bgComment;
          }
          s.reverseBg = null;
        } else {
          commitPendingReverseBg();
        }
        const textProps: TextProps = {
          content: decoded,
          fontHeight: s.field.textH,
          fontWidth: s.field.textW,
          rotation: s.field.textRot,
          reverse: collapse ? true : getReverseFlag(),
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
          makeObj("text", modelPos.x, modelPos.y, textProps, posType, mergedComment),
        );
        resetFB();
        break;
      }
      case "code128":
        objects.push(
          makeObj(
            "code128",
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
            } satisfies Code128Props,
            posType,
            comment,
          ),
        );
        break;
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
        // valid only there; otherwise `_1` is literal field data.
        const gs1Content = s.field.dmEscape && s.field.dmQuality === 200
          ? dataMatrixFdToGs1Content(content, s.field.dmEscape)
          : null;
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

    // Bind pending ^FN slot; existing Variable for same fnNumber is reused.
    if (s.comment.fnNumber !== null) {
      const justPushed = objects[objects.length - 1];
      if (justPushed) {
        // ^TB encodes the bound default (`<<>`), so store the decoded plain
        // value to stay symmetric with the generator; ^FB/plain keep content.
        const varDefault = isTbField ? decoded : content;
        const variable = upsertVariable(s.comment.fnNumber, varDefault, s.comment.fnComment);
        justPushed.variableId = variable.id;
      }
      s.comment.fnNumber = null;
      s.comment.fnComment = undefined;
    }

    s.field.fieldType = null;
    s.field.pendingFD = null;
    s.field.frActive = false;
  };

  return flushField;
}
