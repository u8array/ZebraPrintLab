import type { CustomFontMapping } from "../types/ObjectType";
import {
  FN_NUMBER_MIN,
  FN_NUMBER_MAX,
  uniqueVariableName,
  type Variable,
} from "../types/Variable";
import { embedsToMarkers } from "./fnTemplate";
import { DEFAULT_CLOCK_CHARS, tokensToMarkers } from "./fcTemplate";
import { decodeFbContent } from "./fbContent";
import { zplAnchorToModel } from "./labelGeometry/textPositionTransforms";
import { computeTextRenderMetrics } from "./labelGeometry/textRenderMetrics";
import type { TextProps } from "../registry/text";
import type { Code128Props } from "../registry/code128";
import type { Code39Props } from "../registry/code39";
import type { Ean13Props } from "../registry/ean13";
import type { QrCodeProps } from "../registry/qrcode";
import type { DataMatrixProps } from "../registry/datamatrix";
import type { BoxProps } from "../registry/box";
import type { EllipseProps } from "../registry/ellipse";
import type { LineProps } from "../registry/line";
import type { ImageProps } from "../registry/image";
import type { Barcode1DProps } from "../registry/barcode1d";
import type { Gs1DatabarProps } from "../registry/gs1databar";
import type { Pdf417Props } from "../registry/pdf417";
import type { Code49Props } from "../registry/code49";
import { DEFAULT_GS_SYMBOL, GS_SYMBOL_CODES, type SymbolProps } from "../registry/symbol";
import type { SerialProps } from "../registry/serial";
import { isZplRotation, type ZplRotation } from "../registry/rotation";
import type { AztecProps } from "../registry/aztec";
import type { MaxicodeProps } from "../registry/maxicode";
import type { MicroPdf417Props } from "../registry/micropdf417";
import type { CodablockProps } from "../registry/codablock";
import { formatStoragePath, parseStoragePath } from "./storagePath";
import { loadFontBytesSync } from "./fontCache";
import { ZPL_BUILTIN_FONT_LETTERS } from "./customFonts";
import { GS1_DATABAR_DEFAULT_SEGMENTS } from "./gs1";
import {
  tokenize,
  int,
  makeObj,
  variableNameFromComment,
  ciToEncoding,
  getDecoder,
  decodeFH,
} from "./zplParser/helpers";
import { decodeGraphicToImage } from "./zplParser/decoders/graphic";
import { createParserState, REVERSE_BBOX_TOLERANCE_DOTS } from "./zplParser/context";
import { createLabelConfigHandlers } from "./zplParser/handlers/labelConfig";
import { createSetupScriptHandlers } from "./zplParser/handlers/setupScript";
import { createUnsupportedHandlers } from "./zplParser/handlers/unsupported";
import type {
  Handler,
  ImportFinding,
  ParsedZPL,
} from "./zplParser/types";
export type {
  ImportFindingKind,
  ImportFinding,
  ImportReport,
  ParsedZPL,
} from "./zplParser/types";

/** Characters of a `^GF`/`~DY` payload retained in browserLimit/skipped
 *  findings; rest is replaced with an ellipsis so a single multi-KB
 *  base64 blob doesn't drown out the import report. */
const IMPORT_FINDING_PAYLOAD_LIMIT = 80;

export function parseZPL(zpl: string, dpmm = 8): ParsedZPL {
  const tokens = tokenize(zpl);
  const s = createParserState();
  // Destructured references for sub-state objects whose internal
  // mutations don't need `s.` qualification. Reads via `s.foo` for
  // primitives only; collection references stay bare for terseness.
  // Destructured aliases for high-frequency collection refs so the
  // inline body keeps reading naturally. Primitives stay on `s.foo`
  // (rebound writes need that). The three Map/Set collections that
  // also count as state mutate via method calls so they read cleanest
  // via `s.fontAliases.get(...)` etc — kept on `s.` for consistency.
  const {
    objects, labelConfig, printerProfile, variables,
    skipped, partialCmds, browserLimit, unknown,
  } = s;

  /** Consume and return the pending ^FX comment, then clear it. */
  const takeComment = (): string | undefined => {
    const c = s.pendingComment;
    s.pendingComment = undefined;
    return c;
  };

  const resetFB = () => {
    s.fbWidth = 0;
    s.fbLines = 1;
    s.fbSpacing = 0;
    s.fbJustify = "L";
  };

  /** Get-or-create a Variable for the given FN slot. Three call
   *  sites — bare `^FN^FD^FS` declarations, single-bind fields,
   *  and template-embed references — all funnel through here so
   *  the auto-naming convention (`field_<n>` unless an FX comment
   *  hints otherwise) and the uniqueName collision logic live in
   *  one place. */
  const bootstrapVariable = (
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

  // Build a fnNumber→name map from the variables collected so far,
  // bootstrapping Variables for any FN referenced by embeds in the
  // current field's content. Mirrors the single-bind bootstrap at
  // the bottom of flushField — same auto-name convention so embed-
  // referenced FNs and inline-bound FNs share the same Variable
  // entry when they hit the same slot number.
  const applyFnEmbeds = (payload: string): string => {
    // Match the same shape embedsToMarkers expects: `<e><n><e>` or
    // `<e><n>,...<e>`. A naked `<e><digits>` without a closing `<e>`
    // would otherwise bootstrap a phantom Variable from a literal
    // like `#5 special` and then dangle (no marker emitted).
    const e = s.embedChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    for (const n of seen) bootstrapVariable(n, "");
    const fnToName = new Map(variables.map((v) => [v.fnNumber, v.name]));
    return embedsToMarkers(payload, s.embedChar, fnToName);
  };

  const flushField = () => {
    if (!s.fieldType || s.pendingFD === null) {
      // Bare `^FN<n>^FD<default>^FS` (no ^FO / ^A) is a Variable
      // declaration, not a field. Register the Variable so the
      // default reaches the Variables panel + downstream resolves,
      // and clear s.pendingFn so it doesn't leak into the next field.
      if (s.pendingFn !== null && s.pendingFD !== null) {
        const decl = s.fhActive
          ? decodeFH(s.pendingFD, s.fhDelimiter, s.fhDecoder)
          : s.pendingFD;
        bootstrapVariable(s.pendingFn, decl, s.pendingFnComment);
        s.pendingFn = null;
        s.pendingFnComment = undefined;
      }
      s.pendingFD = null;
      // Clear s.fieldType too so a half-formed field (e.g. `^GS…^FS`
      // without `^FD`) doesn't leak its kind into the next ^FD that
      // arrives via an unrelated ^FO.
      s.fieldType = null;
      return;
    }
    const rawDecoded = s.fhActive
      ? decodeFH(s.pendingFD, s.fhDelimiter, s.fhDecoder)
      : s.pendingFD;
    // Two marker conversions, in order:
    //   1. ^FE-style FN embeds (`#1#` → `«variableName»`), bootstrap
    //      Variables when the FN slot is new — same auto-naming as
    //      the single-bind ^FN path below.
    //   2. ^FC clock tokens (`%d`, `%Y`, …) → `«clock:T»`. Runs after
    //      FN embeds so a payload like `%FN#1#%Y` resolves both.
    const afterFn = applyFnEmbeds(rawDecoded);
    const content = tokensToMarkers(afterFn, s.clockChars);
    const posType: "FT" | "FO" = s.positionIsFT ? "FT" : "FO";
    const comment = takeComment();

    // Decode \& line breaks (and \\ escapes) in ^FB text blocks via the
    // shared helper so parser and generator stay symmetric.
    const decoded = s.fbWidth > 0 ? decodeFbContent(content) : content;

    // Non-text fields can never be the second half of a reverse-text
    // pair, so flush the stashed bg as a regular box before pushing.
    // Text handles its own collapse-or-commit inline below.
    if (s.fieldType !== "text") commitPendingReverseBg();
    switch (s.fieldType) {
      case "text": {
        // ZPL anchors ^FO at cap-top and ^FT at baseline; our internal
        // model stores the Konva render position (EM-top-left) so editor
        // interactions stay shift-free. The FO/I and FO/B shifts also
        // need the rendered ink width — measure it the same way the
        // renderer does so the round-trip stays exact.
        const { inkWidthDots } = computeTextRenderMetrics({
          content: s.snPending ? `#${decoded}` : decoded,
          fontHeight: s.textH,
          fontWidth: s.textW,
          printerFontName: s.pendingPrinterFontName,
        });
        const modelPos = zplAnchorToModel(
          s.x,
          s.y,
          { fontHeight: s.textH, rotation: s.textRot },
          posType,
          inkWidthDots,
        );
        // If ^SF was pending, create a serial object instead of text.
        // Serial fields can't be the second half of a reverse-text pair
        // (no reverse-serial use case in our model), so flush any
        // pending bg as a regular box before pushing the serial.
        if (s.snPending) {
          commitPendingReverseBg();
          objects.push(
            makeObj(
              "serial",
              modelPos.x,
              modelPos.y,
              {
                content: decoded,
                increment: s.snIncrement,
                fontHeight: s.textH,
                fontWidth: s.textW,
                rotation: s.textRot,
                zplMode: s.snMode,
              } satisfies SerialProps,
              posType,
              comment,
            ),
          );
          s.snPending = false;
          s.snIncrement = 1;
          s.snMode = "SN";
          resetFB();
          break;
        }
        // Reverse-text collapse: if the previous field was a filled-black
        // ^GB at this same anchor with a matching bbox, and this text is
        // ^FR-flagged, the pair is our white-on-black emit. Drop the
        // stashed bg and surface a single reverse-text object instead of
        // a box + reverse-text. Dim match uses a small dot-tolerance so
        // rounding in the emitter and parser can't unpair a legitimate
        // pair. Anything that doesn't match flushes the stash as a
        // regular box so hand-written ZPL with unrelated ^GB+^FR
        // sequences round-trips unchanged. ^FB block-text isn't part of
        // the reverse-text emit so collapsing is skipped there too.
        const vertical = s.textRot === "R" || s.textRot === "B";
        const expectedW = vertical ? s.textH : Math.max(1, Math.round(inkWidthDots));
        const expectedH = vertical ? Math.max(1, Math.round(inkWidthDots)) : s.textH;
        const collapse =
          s.pendingReverseBg !== null &&
          s.frActive &&
          s.fbWidth === 0 &&
          s.pendingReverseBg.x === s.x &&
          s.pendingReverseBg.y === s.y &&
          Math.abs(s.pendingReverseBg.w - expectedW) <= REVERSE_BBOX_TOLERANCE_DOTS &&
          Math.abs(s.pendingReverseBg.h - expectedH) <= REVERSE_BBOX_TOLERANCE_DOTS;
        // Preserve any comment that was attached to the stashed ^GB
        // (e.g. a `^FX banner` before the bg). Merged with the text's
        // own comment so no import metadata is silently dropped.
        let mergedComment = comment;
        if (collapse) {
          const bgComment = s.pendingReverseBg?.comment;
          if (bgComment) {
            mergedComment = mergedComment ? `${bgComment}\n${mergedComment}` : bgComment;
          }
          s.pendingReverseBg = null;
        } else {
          commitPendingReverseBg();
        }
        const textProps: TextProps = {
          content: decoded,
          fontHeight: s.textH,
          fontWidth: s.textW,
          rotation: s.textRot,
          reverse: collapse ? true : getReverseFlag(),
          printerFontName: s.pendingPrinterFontName,
          fontId: s.pendingFontId,
        };
        s.pendingPrinterFontName = undefined;
        s.pendingFontId = undefined;
        if (s.fbWidth > 0) {
          textProps.blockWidth = s.fbWidth;
          textProps.blockLines = s.fbLines;
          textProps.blockLineSpacing = s.fbSpacing;
          textProps.blockJustify = s.fbJustify;
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
            s.x,
            s.y,
            {
              content,
              height: s.bcHeight,
              moduleWidth: s.byModuleWidth,
              printInterpretation: s.bcInterp,
              checkDigit: s.bcCheck,
              rotation: s.bcRotation,
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
            s.x,
            s.y,
            {
              content,
              height: s.bcHeight,
              moduleWidth: s.byModuleWidth,
              printInterpretation: s.bcInterp,
              checkDigit: s.bcCheck,
              rotation: s.bcRotation,
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
            s.x,
            s.y,
            {
              content,
              height: s.bcHeight,
              moduleWidth: s.byModuleWidth,
              printInterpretation: s.bcInterp,
              checkDigit: false, // EAN-13 has no user-controlled check digit (^BE auto-appends).
              rotation: s.bcRotation,
            } satisfies Ean13Props,
            posType,
            comment,
          ),
        );
        break;
      case "qrcode": {
        // content format from toZPL: "{ec}A,{data}"  e.g. "QA,https://example.com"
        const ec = (content[0] ?? "Q") as QrCodeProps["errorCorrection"];
        const data = content.slice(3); // skip "{ec}A,"
        objects.push(
          makeObj(
            "qrcode",
            s.x,
            s.y,
            {
              content: data,
              magnification: s.qrMag,
              errorCorrection: ec,
              rotation: s.bcRotation,
            } satisfies QrCodeProps,
            posType,
            comment,
          ),
        );
        break;
      }
      case "datamatrix":
        objects.push(
          makeObj(
            "datamatrix",
            s.x,
            s.y,
            {
              content,
              dimension: s.dmDim,
              quality: s.dmQuality,
              rotation: s.bcRotation,
            } satisfies DataMatrixProps,
            posType,
            comment,
          ),
        );
        break;
      case "upca":
      case "ean8":
      case "upce":
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
            s.fieldType,
            s.x,
            s.y,
            {
              content,
              height: s.bcHeight,
              moduleWidth: s.byModuleWidth,
              printInterpretation: s.bcInterp,
              checkDigit: s.bcCheck,
              rotation: s.bcRotation,
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
            s.x,
            s.y,
            {
              content,
              moduleWidth: s.byModuleWidth,
              symbology: s.gsSymbology,
              segments: s.gsSegments,
              rotation: s.bcRotation,
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
            s.x,
            s.y,
            {
              content,
              rowHeight: s.pdfRowHeight,
              securityLevel: s.pdfSecurity,
              columns: s.pdfColumns,
              moduleWidth: s.byModuleWidth,
              rotation: s.bcRotation,
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
            s.x,
            s.y,
            {
              content,
              height: s.bcHeight,
              moduleWidth: s.byModuleWidth,
              printInterpretation: s.bcInterp,
              mode: s.bcCode49Mode,
              rotation: s.bcRotation,
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
            s.x,
            s.y,
            {
              content,
              magnification: s.aztecMag,
              ecLevel: 0,
              rotation: s.bcRotation,
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
            s.x,
            s.y,
            {
              content,
              mode: s.maxicodeMode,
              rotation: s.bcRotation,
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
            s.x,
            s.y,
            {
              content,
              moduleWidth: s.byModuleWidth,
              rowHeight: s.mpdfRowHeight,
              mode: 0,
              rotation: s.bcRotation,
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
            s.x,
            s.y,
            {
              content,
              moduleWidth: s.byModuleWidth,
              rowHeight: s.cbRowHeight,
              securityLevel: s.cbSecurity,
              rotation: s.bcRotation,
            } satisfies CodablockProps,
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
            s.x,
            s.y,
            {
              symbol: code,
              height: s.symH,
              width: s.symW,
              rotation: s.symRot,
            } satisfies SymbolProps,
            posType,
            comment,
          ),
        );
        break;
      }
    }

    // Apply the pending `^FN{n}` slot (if any) to the field we just
    // pushed. Reuse an existing Variable when its fnNumber matches —
    // ZPL templates often reference the same slot multiple times,
    // and the binding should funnel to one Variable, not duplicates.
    if (s.pendingFn !== null) {
      const justPushed = objects[objects.length - 1];
      if (justPushed) {
        const variable = bootstrapVariable(s.pendingFn, content, s.pendingFnComment);
        justPushed.variableId = variable.id;
      }
      s.pendingFn = null;
      s.pendingFnComment = undefined;
    }

    s.fieldType = null;
    s.pendingFD = null;
    s.frActive = false;
  };

  // ── Command handler map ────────────────────────────────────────────────────
  const resetComment: Handler = (_, rest) => {
    s.pendingComment = rest.trim() || undefined;
  };
  // Hand-written ZPL often splits a logical comment across several `^FX` lines
  // before the field they describe. Accumulate them so each line survives on
  // the imported object's comment field; XA/XZ still reset at label boundaries.
  const appendComment: Handler = (_, rest) => {
    const next = rest.trim();
    if (!next) return;
    s.pendingComment = s.pendingComment ? `${s.pendingComment}\n${next}` : next;
  };

  const readRotation = (raw: string | undefined): ZplRotation =>
    raw && isZplRotation(raw) ? raw : "N";

  const handleAztec: Handler = (p) => {
    s.fieldType = "aztec";
    s.bcRotation = readRotation(p[0]);
    s.aztecMag = int(p[1], 4);
  };

  // Factory for standard 1D barcode commands that share the same state variables.
  // hIdx/iIdx/cIdx are the comma-split parameter indices for height/interp/check.
  const mkBarcode =
    (
      type: string,
      hIdx: number,
      iIdx: number,
      iDefault = "Y",
      cIdx = -1,
    ): Handler =>
    (p) => {
      s.fieldType = type;
      s.bcRotation = readRotation(p[0]);
      s.bcHeight = int(p[hIdx], s.byHeight || 100);
      s.bcInterp = (p[iIdx] ?? iDefault) === "Y";
      if (cIdx >= 0) s.bcCheck = (p[cIdx] ?? "N") === "Y";
    };

  const getReverseFlag = () => s.lrActive || s.frActive || undefined;

  /** Push a ^GB-derived object using the standard line-vs-box detection.
   *  Shared between the GB handler's direct-push path and the
   *  reverse-bg commit path so a stashed GB that didn't pair with a
   *  reverse-text gets the same line/box classification it would have
   *  gotten on a direct parse. */
  const pushGBObject = (
    gx: number,
    gy: number,
    w: number,
    h: number,
    t: number,
    color: "B" | "W",
    rounding: number,
    reverseFlag: boolean | undefined,
    comment: string | undefined,
  ) => {
    if (h === t && w > t) {
      objects.push(
        makeObj(
          "line",
          gx,
          gy,
          { angle: 0, length: w, thickness: t, color, reverse: reverseFlag } satisfies LineProps,
          undefined,
          comment,
        ),
      );
    } else if (w === t && h > t) {
      objects.push(
        makeObj(
          "line",
          gx,
          gy,
          { angle: 90, length: h, thickness: t, color, reverse: reverseFlag } satisfies LineProps,
          undefined,
          comment,
        ),
      );
    } else {
      const filled = t >= Math.min(w, h);
      objects.push(
        makeObj(
          "box",
          gx,
          gy,
          {
            width: w,
            height: h,
            thickness: t,
            filled,
            color,
            rounding,
            reverse: reverseFlag,
          } satisfies BoxProps,
          undefined,
          comment,
        ),
      );
    }
  };

  /** Push the stashed reverse-bg as the GB shape it actually was. Called
   *  when the stash didn't pair with a reverse-text on the next field. */
  const commitPendingReverseBg = () => {
    if (!s.pendingReverseBg) return;
    const bg = s.pendingReverseBg;
    s.pendingReverseBg = null;
    pushGBObject(bg.x, bg.y, bg.w, bg.h, bg.t, bg.color, bg.rounding, bg.reverseFlag, bg.comment);
  };

  const handlers: Record<string, Handler> = {
    // ── Label dimensions ────────────────────────────────────────────────────
    // PW / LL — extracted to handlers/labelConfig.ts (need dpmm).

    // ── Field origin ────────────────────────────────────────────────────────
    FO(p) {
      flushField();
      s.frActive = false;
      s.x = int(p[0]) + s.lhX;
      s.y = int(p[1]) + s.lhY + s.ltY;
      // 3rd param is justification (0/1/2) — stored but not actively used
      s.positionIsFT = false;
    },
    FT(p) {
      flushField();
      s.frActive = false;
      s.x = int(p[0]) + s.lhX;
      s.y = int(p[1]) + s.lhY + s.ltY;
      s.positionIsFT = true;
    },

    // ── Text ────────────────────────────────────────────────────────────────
    // ^A0{rotation},{height},{width}  e.g. ^A0N,30,0
    A0(p, rest) {
      s.fieldType = "text";
      s.textRot = (rest[0] as TextProps["rotation"]) ?? s.fwRotation;
      s.textH = int(p[1], s.cfHeight || 30);
      s.textW = int(p[2], s.cfWidth || 0);
      // Set fontId="0" only when the current ^CF is not already 0 —
      // otherwise the field is just repeating the label default, and
      // we keep fontId undefined so the model says "use the default".
      // When no ^CF has fired, "0" is the historical baseline both the
      // generator and the printer fall back to, so it counts as default.
      s.pendingFontId = s.cfFontId && s.cfFontId !== "0" ? "0" : undefined;
    },

    // ── Change alphanumeric default font ────────────────────────────────────
    // ^CF{font},{height},{width}  → sets default for fields without ^A
    CF(p) {
      const fontId = (p[0] ?? "").trim();
      const explicitHeight = parseInt(p[1] ?? "", 10);
      const explicitWidth = parseInt(p[2] ?? "", 10);
      s.cfHeight = isNaN(explicitHeight) ? s.cfHeight : explicitHeight;
      s.cfWidth = isNaN(explicitWidth) ? s.cfWidth : explicitWidth;
      if (fontId) {
        labelConfig.defaultFontId = fontId;
        s.cfFontId = fontId;
      }
      if (!isNaN(explicitHeight) && explicitHeight > 0) {
        labelConfig.defaultFontHeight = explicitHeight;
      }
      if (!isNaN(explicitWidth) && explicitWidth >= 0) {
        labelConfig.defaultFontWidth = explicitWidth;
      }
    },

    // ── Field-wide default rotation ─────────────────────────────────────────
    // ^FW{rotation}  e.g. ^FWR
    FW(_, rest) {
      const fw = (rest[0] ?? "N").toUpperCase();
      if (fw === "N" || fw === "R" || fw === "I" || fw === "B") {
        s.fwRotation = fw;
      }
    },

    // ── Field block ─────────────────────────────────────────────────────────
    // ^FB{width},{lines},{lineSpacing},{justify},{hangingIndent}
    FB(p) {
      s.fbWidth = int(p[0], 0);
      s.fbLines = int(p[1], 1);
      s.fbSpacing = int(p[2], 0);
      const fbJ = (p[3] ?? "L").toUpperCase();
      s.fbJustify = fbJ === "C" || fbJ === "R" || fbJ === "J" ? fbJ : "L";
      // ^FB also implies text if no ^A was specified
      if (!s.fieldType) {
        s.fieldType = "text";
        s.textH = s.cfHeight || 30;
        s.textW = s.cfWidth || 0;
        s.textRot = s.fwRotation;
      }
    },

    // ── Barcode defaults ────────────────────────────────────────────────────
    // ^BY{module_width},{ratio},{height}
    BY(p) {
      s.byModuleWidth = int(p[0], 2);
      s.byHeight = int(p[2], 0);
    },

    // ── Barcodes ────────────────────────────────────────────────────────────
    // mkBarcode(type, hIdx, iIdx, iDefault?, cIdx?)
    // hIdx/iIdx/cIdx = comma-split param positions for height/interp/check
    BC: mkBarcode("code128", 1, 2, "Y", 4), // ^BCN,h,i,N,c
    B3: mkBarcode("code39", 2, 3, "Y", 1), // ^B3N,c,h,i,N
    BE: mkBarcode("ean13", 1, 2), // ^BEN,h,i,N
    BU: mkBarcode("upca", 1, 2), // ^BUN,h,i,N,N
    B8: mkBarcode("ean8", 1, 2), // ^B8N,h,i,N
    B9: mkBarcode("upce", 1, 2), // ^B9N,h,i,N
    B2: mkBarcode("interleaved2of5", 1, 2, "Y", 4), // ^B2N,h,i,N,c
    BA: mkBarcode("code93", 1, 2, "Y", 4), // ^BAN,h,i,N,c
    B1: mkBarcode("code11", 2, 3, "Y", 1), // ^B1N,c,h,i,N
    BI: mkBarcode("industrial2of5", 1, 2), // ^BIN,h,i,N
    BJ: mkBarcode("standard2of5", 1, 2), // ^BJN,h,i,N
    BK: mkBarcode("codabar", 2, 3, "Y", 1), // ^BKN,c,h,i,N
    BL: mkBarcode("logmars", 1, 2, "N"), // ^BLN,h,i  — interp default N
    BP: mkBarcode("plessey", 2, 3, "Y", 1), // ^BPN,c,h,i,N
    B5: mkBarcode("planet", 1, 2), // ^B5N,h,i,N
    BZ: mkBarcode("postal", 1, 2), // ^BZN,h,i,N
    BS: mkBarcode("upcEanExtension", 1, 2), // ^BSo,h,f (UPC/EAN 2- or 5-digit supplement)
    B4: (p) => {
      // ^B4o,h,f,m — Code 49. Custom handler for the extra `m`.
      s.fieldType = "code49";
      s.bcRotation = readRotation(p[0]);
      s.bcHeight = int(p[1], s.byHeight || 20);
      s.bcInterp = (p[2] ?? "N") === "Y";
      const m = (p[3] ?? "A").toUpperCase();
      s.bcCode49Mode = /^[A0-5]$/.test(m)
        ? (m as Code49Props["mode"])
        : "A";
    },

    // MSI: check logic is "any letter except N" (not simple "Y") — keep inline
    // ^BMN,{checkType},{height},{interp},N  (checkType: A/B/C/D=enabled, N=none)
    BM(p) {
      s.fieldType = "msi";
      s.bcRotation = readRotation(p[0]);
      s.bcCheck = (p[1] ?? "N") !== "N";
      s.bcHeight = int(p[2], s.byHeight || 100);
      s.bcInterp = (p[3] ?? "Y") === "Y";
    },
    // GS1 Databar: different param layout, also updates s.byModuleWidth
    // ^BRo,{symbology},{magnification},{separator},{height},{segments}
    BR(p) {
      s.fieldType = "gs1databar";
      s.bcRotation = readRotation(p[0]);
      s.byModuleWidth = int(p[2], s.byModuleWidth);
      s.gsSymbology = (int(p[1], 1) as Gs1DatabarProps["symbology"]) || 1;
      s.gsSegments =
        p[5] !== undefined
          ? int(p[5], GS1_DATABAR_DEFAULT_SEGMENTS)
          : undefined;
    },

    // ^BQN,2,{magnification} — QR Code
    BQ(p) {
      s.fieldType = "qrcode";
      s.bcRotation = readRotation(p[0]);
      s.qrMag = int(p[2], 4);
    },
    // ^BXN,{dimension},{quality} — DataMatrix
    BX(p) {
      s.fieldType = "datamatrix";
      s.bcRotation = readRotation(p[0]);
      s.dmDim = int(p[1], 5);
      s.dmQuality = int(p[2], 200) as DataMatrixProps["quality"];
    },
    // ^B7N,{rowHeight},{securityLevel},{columns},,, — PDF417
    B7(p) {
      s.fieldType = "pdf417";
      s.bcRotation = readRotation(p[0]);
      s.pdfRowHeight = int(p[1], 10);
      s.pdfSecurity = int(p[2], 0);
      s.pdfColumns = int(p[3], 0);
    },
    // ^B0N,{magnification},... / ^BON,... — Aztec (^B0 and ^BO are synonyms)
    B0: handleAztec,
    BO: handleAztec,
    // ^BVo,{mode},{symbolNumber},{totalSymbols} — Maxicode (fixed
    // physical size, no magnification). symbolNumber/totalSymbols
    // describe structured-append composition; we don't expose that
    // in the editor, so the params are read but the emitted form
    // pins them to (1, 1).
    BV(p) {
      s.fieldType = "maxicode";
      s.bcRotation = readRotation(p[0]);
      const m = int(p[1], 4);
      s.maxicodeMode = (m >= 2 && m <= 6 ? m : 4) as MaxicodeProps["mode"];
    },
    // ^BFN,{rowHeight} — MicroPDF417
    BF(p) {
      s.fieldType = "micropdf417";
      s.bcRotation = readRotation(p[0]);
      s.mpdfRowHeight = int(p[1], 10);
    },
    // ^BBN,{rowHeight},{security},{numCharsPerRow},{numRows},{mode} — CODABLOCK
    BB(p) {
      s.fieldType = "codablock";
      s.bcRotation = readRotation(p[0]);
      s.cbRowHeight = int(p[1], 10);
      s.cbSecurity = (p[2] ?? "Y") === "N" ? "N" : "Y";
    },

    // ── Field hex indicator ─────────────────────────────────────────────────
    FH(_, rest) {
      s.fhActive = true;
      s.fhDelimiter = rest[0] ?? "_";
    },

    // ── Field data / separator ──────────────────────────────────────────────
    FD(_, rest) {
      // Implicit text field: ^FD without a prior ^A uses ^CF defaults.
      // Skip the implicit promotion when s.pendingFn is set — that means
      // we're looking at a bare `^FN<n>^FD<default>^FS` Variable
      // declaration (the docs-example form for ^FE inline embeds),
      // which flushField then routes through the bare-declaration
      // path (no field object, just Variable registration).
      if (!s.fieldType && s.pendingFn === null) {
        s.fieldType = "text";
        s.textH = s.cfHeight || 30;
        s.textW = s.cfWidth || 0;
        s.textRot = s.fwRotation;
      }
      s.pendingFD = rest;
    },
    FS() {
      flushField();
      s.fhActive = false;
      s.positionIsFT = false;
    },

    // ── Serialization ───────────────────────────────────────────────────────
    SN(p) {
      // ^SN{start},{increment},{leadZero}
      // Appears AFTER the ^FD for this field — upgrade the last text object to serial
      const snStart = p[0] ?? "";
      const snInc = int(p[1], 1);
      const lastObj = objects[objects.length - 1];
      if (lastObj && lastObj.type === "text") {
        const tp = lastObj.props;
        const serialObj = makeObj(
          "serial",
          lastObj.x,
          lastObj.y,
          {
            content: snStart || tp.content || "001",
            increment: snInc,
            fontHeight: tp.fontHeight ?? 30,
            fontWidth: tp.fontWidth ?? 0,
            rotation: tp.rotation ?? "N",
            zplMode: "SN",
          } satisfies SerialProps,
          lastObj.positionType,
          lastObj.comment,
        );
        objects[objects.length - 1] = serialObj;
      }
    },
    SF(p) {
      // ^SF{increment},{padDigits},{leadZero}
      // Appears BEFORE ^FD — set pending state so flushField creates serial
      s.snPending = true;
      s.snIncrement = int(p[0], 1);
      s.snMode = "SF";
    },

    // ── Label reverse / field reverse ───────────────────────────────────────
    LR(_, rest) {
      s.lrActive = rest.toUpperCase().startsWith("Y");
    },
    FR() {
      s.frActive = true;
    },

    // ── Label home (origin offset) ──────────────────────────────────────────
    LH(p) {
      s.lhX = int(p[0], 0);
      s.lhY = int(p[1], 0);
    },

    // ── Label top (vertical offset) ─────────────────────────────────────────
    LT(_, rest) {
      s.ltY = int(rest, 0);
    },

    // ── Graphics ────────────────────────────────────────────────────────────
    GB(p) {
      // ^GB{w},{h},{t},{color},{rounding}
      // ZPL: w=0 or h=0 means "use thickness value" for that dimension
      const t = int(p[2], 3);
      const rawW = int(p[0], t);
      const rawH = int(p[1], t);
      const w = rawW === 0 ? t : rawW;
      const h = rawH === 0 ? t : rawH;
      const color = (p[3] ?? "B") as "B" | "W";
      const rounding = int(p[4], 0);
      const gbComment = takeComment();

      // Filled-black non-rounded ^GBs (no active ^LR/^FR) are candidate
      // reverse-text backgrounds — stash them and let flushField
      // collapse the pair when the next field is an ^FR text at the
      // same anchor with matching bbox. Stash is opaque: it stores the
      // raw GB params so the commit path replays through the same
      // line-vs-box detection a direct parse would use (a fat
      // horizontal line and a reverse-bg banner share the same GB
      // shape; only the following ^FR text disambiguates).
      const filled = t >= Math.min(w, h);
      const reverseFlag = getReverseFlag();
      if (filled && color === "B" && rounding === 0 && !reverseFlag) {
        commitPendingReverseBg();
        s.pendingReverseBg = { x: s.x, y: s.y, w, h, t, color, rounding, reverseFlag, comment: gbComment };
        return;
      }
      commitPendingReverseBg();
      pushGBObject(s.x, s.y, w, h, t, color, rounding, reverseFlag, gbComment);
    },
    GD(p) {
      commitPendingReverseBg();
      // ^GD{w},{h},{t},{color},{orientation}
      // orientation: L = top-left→bottom-right, R = top-right→bottom-left
      const gdW = int(p[0], 1);
      const gdH = int(p[1], 1);
      const gdT = int(p[2], 3);
      const gdColor = (p[3] ?? "B") as "B" | "W";
      const gdOri = (p[4] ?? "L").toUpperCase();
      const gdLen = Math.round(Math.sqrt(gdW * gdW + gdH * gdH));
      // Recover start point and angle from bounding-box FO position
      // 'L': dx>0,dy>0 → obj.x=boxX, angle=atan2(h,w)
      // 'R': dx<0,dy>0 → obj.x=boxX+w, angle=atan2(h,-w)
      const gdObjX = gdOri === "R" ? s.x + gdW : s.x;
      const gdAngle = Math.round(
        gdOri === "R"
          ? (Math.atan2(gdH, -gdW) * 180) / Math.PI
          : (Math.atan2(gdH, gdW) * 180) / Math.PI,
      );
      objects.push(
        makeObj(
          "line",
          gdObjX,
          s.y,
          {
            angle: gdAngle,
            length: gdLen,
            thickness: gdT,
            color: gdColor,
            reverse: getReverseFlag(),
          } satisfies LineProps,
          undefined,
          takeComment(),
        ),
      );
    },
    GF(_, rest) {
      commitPendingReverseBg();
      // ^GF{A|B|C},{totalBytes},{totalBytes},{bytesPerRow},{payload}
      //
      // Payload variants the parser understands:
      //   - format=A + raw hex (optionally with G-Y/g-z/!/,/: RLE)
      //   - any format + `:B64:<base64>:<crc>` wrapper (base64-decoded)
      //   - any format + `:Z64:<base64>:<crc>` wrapper (zlib-inflated via
      //     fflate). CRC mismatch → partial finding (printers tolerate),
      //     inflate failure → browserLimit (payload unrecoverable).
      const format = rest[0]?.toUpperCase();
      if (format !== "A" && format !== "B" && format !== "C") {
        skipped.push(`^GF${rest}`);
        browserLimit.push(`^GF${rest}`);
        return;
      }

      // Extract params: skip "A," then find 3rd comma to separate params from data
      const gfRest = rest.slice(2); // "total,total,bytesPerRow,data..."
      let commaPos = -1;
      for (let n = 0; n < 3; n++) {
        commaPos = gfRest.indexOf(",", commaPos + 1);
        if (commaPos === -1) break;
      }
      if (commaPos === -1) {
        skipped.push(`^GF${rest}`);
        return;
      }

      const gfParams = gfRest.slice(0, commaPos).split(",");
      const gfBytesPerRow = int(gfParams[2], 0);
      // Everything after the 3rd comma is the (possibly compressed) graphic data
      const gfRawData = gfRest.slice(commaPos + 1);

      if (gfBytesPerRow <= 0) {
        skipped.push(`^GF${rest}`);
        return;
      }

      const gfSummary = `^GF${rest.slice(0, IMPORT_FINDING_PAYLOAD_LIMIT)}…`;
      // Preserve the source bytes-headers verbatim so re-export keeps the
      // firmware's input-buffer hint intact (^GFC/:Z64: has total ≠ data).
      const gfImage = decodeGraphicToImage(
        gfRawData,
        format,
        gfBytesPerRow,
        gfParams[0] ?? "",
        gfParams[1] ?? "",
        `imported_${crypto.randomUUID().slice(0, 8)}.png`,
      );
      if (!gfImage) {
        skipped.push(gfSummary);
        browserLimit.push(gfSummary);
        return;
      }
      if (!gfImage.crcOk) partialCmds.add("^GF");
      const posType: "FT" | "FO" = s.positionIsFT ? "FT" : "FO";
      objects.push(
        makeObj(
          "image",
          s.x,
          s.y,
          {
            imageId: gfImage.imageId,
            widthDots: gfImage.widthDots,
            threshold: 128,
            _gfaCache: gfImage.gfaCache,
          } satisfies ImageProps,
          posType,
          takeComment(),
        ),
      );
    },
    GE(p) {
      commitPendingReverseBg();
      // ^GE{w},{h},{t},{color}
      const w = int(p[0], 100);
      const h = int(p[1], 100);
      const t = int(p[2], 3);
      const color = (p[3] ?? "B") as "B" | "W";
      const filled = t >= Math.min(w, h);
      objects.push(
        makeObj(
          "ellipse",
          s.x,
          s.y,
          {
            width: w,
            height: h,
            // Preserve the original thickness (same rationale as ^GB) so a
            // ZPL round-trip is lossless. UI sets sensible defaults when
            // the user toggles `filled` off; the parser stays faithful.
            thickness: t,
            filled,
            color,
            reverse: getReverseFlag(),
          } satisfies EllipseProps,
          undefined,
          takeComment(),
        ),
      );
    },
    GC(p) {
      commitPendingReverseBg();
      // ^GC{diameter},{thickness},{color}  → circle = ellipse with equal w/h
      const d = int(p[0], 100);
      const t = int(p[1], 3);
      const color = (p[2] ?? "B") as "B" | "W";
      const filled = t >= d;
      objects.push(
        makeObj(
          "ellipse",
          s.x,
          s.y,
          {
            width: d,
            height: d,
            thickness: t,
            filled,
            color,
            lockAspect: true,
            reverse: getReverseFlag(),
          } satisfies EllipseProps,
          undefined,
          takeComment(),
        ),
      );
    },

    // ── Recall stored graphic ──────────────────────────────────────────────
    XG(_, rest) {
      commitPendingReverseBg();
      // ^XGd:f.x,mx,my — references a graphic uploaded earlier via ~DY.
      // Two valid imports:
      //  - With preceding ~DY in the stream: full image (bytes + storedAs
      //    with embedInZpl=true) so re-emit produces the same upload+recall.
      //  - Without ~DY: the printer is assumed to host the file out-of-band
      //    (admin pre-loaded). Object gets storedAs.embedInZpl=false and
      //    no cached bitmap; the canvas falls back to a placeholder, the
      //    emitter skips the ~DY preamble but keeps the ^XG reference.
      const firstComma = rest.indexOf(",");
      const xgPath = firstComma === -1 ? rest : rest.slice(0, firstComma);
      const parsed = parseStoragePath(xgPath);
      if (!parsed) {
        skipped.push(`^XG${rest}`);
        browserLimit.push(`^XG${rest}`);
        return;
      }
      const uploaded = s.downloadedGraphics.get(formatStoragePath(parsed, true));
      const posType: "FT" | "FO" = s.positionIsFT ? "FT" : "FO";
      if (uploaded) {
        objects.push(
          makeObj(
            "image",
            s.x,
            s.y,
            {
              imageId: uploaded.imageId,
              widthDots: uploaded.widthDots,
              threshold: 128,
              _gfaCache: uploaded.gfaCache,
              storedAs: { ...parsed, embedInZpl: true },
            } satisfies ImageProps,
            posType,
            takeComment(),
          ),
        );
        return;
      }
      // Recall-only: no bytes available, but the ZPL is valid and the
      // printer side is assumed to resolve. Surface as partial so the
      // import report flags the degraded preview.
      partialCmds.add("^XG");
      objects.push(
        makeObj(
          "image",
          s.x,
          s.y,
          {
            imageId: "",
            widthDots: 200,
            threshold: 128,
            storedAs: { ...parsed, embedInZpl: false },
          } satisfies ImageProps,
          posType,
          takeComment(),
        ),
      );
    },

    // ── Label print settings ────────────────────────────────────────────────
    // PQ / MM / LS / PR / MD / MT / MN / ML / MF / XB / PO / PM / ~SD
    // extracted to handlers/labelConfig.ts; merged below at the literal end.
    //
    // JZ / JT / TA / ST / KD / KL / SE / SZ / KN / SL — Setup-Script
    // handlers extracted to handlers/setupScript.ts; merged below too.

    // ^CW {alias},{path} — register an alias for a printer-resident font.
    // Subsequent ^A{alias} fields resolve to {path} via the s.fontAliases
    // map. The mapping is also persisted on labelConfig so the generator
    // can re-emit it on round-trip. Upsert by alias mirrors the
    // Map-set semantics of s.fontAliases: a later ^CW for the same alias
    // replaces the earlier mapping rather than accumulating duplicates.
    CW(p) {
      const alias = (p[0] ?? "").trim().toUpperCase();
      const path = (p[1] ?? "").trim();
      if (!/^[A-Z0-9]$/.test(alias) || !path) return;
      s.fontAliases.set(alias, path);
      const list = (labelConfig.customFonts ?? []).filter(
        (m) => m.alias !== alias,
      );
      const entry: CustomFontMapping = { alias, path };
      if (s.downloadedFontPaths.has(path)) {
        // The bytes already shipped via ~DY earlier in the stream;
        // surface that intent on the model so re-emit will ~DY again.
        entry.embedInZpl = true;
        // The fontCache key is the filename portion of the path
        // (drive prefix stripped), matching how ~DY registers fonts.
        const colonIdx = path.indexOf(":");
        const filename = colonIdx >= 0 ? path.slice(colonIdx + 1) : path;
        if (filename) entry.previewFontName = filename;
      }
      labelConfig.customFonts = [...list, entry];
    },

    // ── ~DY downloaded TrueType payload ─────────────────────────────────────
    // ~DY{drive}:{name},{fmt},{ext},{size},{bpr},{data}
    // Decodes ASCII hex (format 'A') TTF/OTF bytes into the font cache
    // so the canvas can preview the embedded font without a separate
    // upload. The path reconstruction (stem + extension code) round-
    // trips the same form the generator emits. Non-TTF extensions and
    // non-hex formats are left untouched and fall through to the
    // browser-limit bucket so the user sees what was dropped.
    DY(_p, rest) {
      // Parse manually because the data segment can be hundreds of
      // KB of hex; we want to avoid splitting that into the rest of
      // the params array. Param layout up to and including bytes-per-
      // row is fixed-arity, so we walk commas until we've found 5.
      const c: number[] = [];
      for (let i = 0; i < rest.length && c.length < 5; i++) {
        if (rest[i] === ",") c.push(i);
      }
      if (c.length < 5) {
        browserLimit.push(`~DY${rest}`);
        return;
      }
      const [c0, c1, c2, c3, c4] = c;
      if (
        c0 === undefined ||
        c1 === undefined ||
        c2 === undefined ||
        c3 === undefined ||
        c4 === undefined
      ) {
        browserLimit.push(`~DY${rest}`);
        return;
      }
      const path = rest.slice(0, c0);
      const fmt = rest.slice(c0 + 1, c1).toUpperCase();
      const extCode = rest.slice(c1 + 1, c2).toUpperCase();
      const size = parseInt(rest.slice(c2 + 1, c3), 10);
      const dyBytesPerRow = parseInt(rest.slice(c3 + 1, c4), 10);
      const data = rest.slice(c4 + 1);
      const dySummary = `~DY${rest.slice(0, IMPORT_FINDING_PAYLOAD_LIMIT)}…`;

      // Graphic uploads (~DY ...,A/B/C,G,...): decode via the same payload
      // pipeline as ^GF, register the resulting image under the full
      // device:stem.GRF path. A subsequent ^XG can then instantiate it.
      if (extCode === "G" && (fmt === "A" || fmt === "B" || fmt === "C")) {
        if (!path || isNaN(dyBytesPerRow) || dyBytesPerRow <= 0) {
          skipped.push(dySummary);
          browserLimit.push(dySummary);
          return;
        }
        const sizeStr = size > 0 ? String(size) : "";
        const dyImage = decodeGraphicToImage(
          data,
          fmt,
          dyBytesPerRow,
          sizeStr,
          sizeStr,
          `uploaded_${path.replace(/[:.]/g, "_")}.png`,
        );
        if (!dyImage) {
          skipped.push(dySummary);
          browserLimit.push(dySummary);
          return;
        }
        if (!dyImage.crcOk) partialCmds.add("~DY");
        // Path normalisation: ~DY uses `device:stem` without extension; the
        // ^XG side resolves `device:stem.GRF`. Store the `.GRF` form so the
        // XG lookup is direct.
        const parsedDyPath = parseStoragePath(path);
        if (!parsedDyPath) {
          skipped.push(dySummary);
          browserLimit.push(dySummary);
          return;
        }
        s.downloadedGraphics.set(formatStoragePath(parsedDyPath, true), {
          imageId: dyImage.imageId,
          widthDots: dyImage.widthDots,
          heightDots: dyImage.heightDots,
          gfaCache: dyImage.gfaCache,
        });
        return;
      }

      // Only ASCII-hex TTF/OTF imports are supported. Z64 / compressed
      // payloads need a CRC-checked decoder and stay out of scope.
      if (fmt !== "A" || (extCode !== "T" && extCode !== "B")) {
        browserLimit.push(dySummary);
        return;
      }
      if (!path || isNaN(size) || size <= 0 || data.length < size * 2) {
        browserLimit.push(dySummary);
        return;
      }
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        const byteHex = data.slice(i * 2, i * 2 + 2);
        const b = parseInt(byteHex, 16);
        if (isNaN(b)) {
          browserLimit.push(`~DY${rest.slice(0, 80)}…`);
          return;
        }
        bytes[i] = b;
      }
      // Reconstruct the full filename with extension so the registered
      // name matches what ^CW points at. Generator emits "{stem}" with
      // the extension stripped, so we re-attach based on the code.
      const ext = extCode === "T" ? ".TTF" : ".BIN";
      const filename = path.includes(".")
        ? path.slice(path.lastIndexOf(":") + 1)
        : `${path.slice(path.indexOf(":") + 1)}${ext}`;
      const fullPath = path.includes(".") ? path : `${path}${ext}`;
      try {
        loadFontBytesSync(bytes, filename);
        s.downloadedFontPaths.add(fullPath);
      } catch {
        // Oversized or otherwise unloadable — surface as browser-limit.
        browserLimit.push(`~DY${path}`);
      }
    },

    // ── Browser-limit: printer-specific features ────────────────────────────
    GS(p) {
      // ^GS{rotation},{height},{width} — selects the internal-font
      // legal-symbol glyph (^FD picks which: A=®, B=©, C=™, D=UL, E=CSA).
      s.fieldType = "symbol";
      s.symRot = readRotation(p[0]);
      s.symH = int(p[1], 30);
      s.symW = int(p[2], s.symH);
    },

    // ── TrueType font / text block ──────────────────────────────────────────
    // ^A@{rotation},{height},{width},{drive}:{font} — TrueType font reference
    // Can't load printer TrueType fonts; import as text with best-effort sizing
    "A@"(p, rest) {
      s.fieldType = "text";
      s.textRot = (rest[0] as TextProps["rotation"]) ?? s.fwRotation;
      s.textH = int(p[1]) || s.cfHeight || 30;
      s.textW = int(p[2]) || s.cfWidth || 0;
      const fontRef = p[3] ?? "";
      const colonIdx = fontRef.indexOf(":");
      s.pendingPrinterFontName =
        (colonIdx >= 0 ? fontRef.slice(colonIdx + 1) : fontRef) || undefined;
      partialCmds.add("^A@");
    },
    // ^TB{rotation},{width},{height} — text block (alternative to ^A + ^FB)
    TB(p, rest) {
      s.fieldType = "text";
      s.textRot = (rest[0] as TextProps["rotation"]) ?? s.fwRotation;
      const tbW = int(p[1], 0);
      const tbH = int(p[2], 0);
      s.textH = s.cfHeight || 30;
      s.textW = s.cfWidth || 0;
      if (tbW > 0) {
        s.fbWidth = tbW;
        s.fbLines = tbH > 0 ? Math.floor(tbH / (s.textH || 30)) : 1;
        s.fbJustify = "L";
      }
    },

    // ── Ignored / structural ────────────────────────────────────────────────
    // ^XA / ^XZ: label start/end. Reset format-scoped directives so a
    // multi-label stream doesn't leak ^FE/^FC overrides from a prior
    // ^XA…^XZ block into the next one — without this `^FC@^...^XZ^XA`
    // would parse later default-char tokens differently.
    XA: (p, rest) => {
      // Defensive: flush any stash that survived a malformed prior
      // label (missing ^XZ) so it doesn't bleed into the new block.
      commitPendingReverseBg();
      s.embedChar = "#";
      s.clockChars = { ...DEFAULT_CLOCK_CHARS };
      resetComment(p, rest);
    },
    XZ(_, rest) {
      // Flush any orphan reverse-bg before the label boundary so it
      // doesn't leak across labels in a multi-label stream.
      commitPendingReverseBg();
      resetComment(_, rest);
    },
    // ^FX: comment field — accumulate across consecutive ^FX lines so the
    // assembled text reaches the next field object as one multi-line comment.
    FX: appendComment,

    // ^CI N: character set / encoding for ^FH byte decoding. Mapped to a
    // TextDecoder; unsupported variants (UTF-16/32, code page 850) keep the
    // current decoder and surface as a partial import.
    CI: (p) => {
      const enc = ciToEncoding(int(p[0]));
      s.fhDecoder = getDecoder(enc.label);
      if (!enc.supported) partialCmds.add(`^CI${int(p[0])}`);
    },

    // ^FN{n}: declares that the next field is a template slot. The
    // accompanying ^FD payload becomes the slot's default value at
    // flushField time. Out-of-range numbers (Zebra accepts 0/100+ on
    // newer firmware, but our model caps at 99) are ignored so they
    // don't poison the binding.
    FN: (p) => {
      const n = int(p[0]);
      if (n < FN_NUMBER_MIN || n > FN_NUMBER_MAX) {
        partialCmds.add("^FN");
        return;
      }
      s.pendingFn = n;
      s.pendingFnComment = s.pendingComment;
    },
    FC: (p) => {
      // ^FC<a>,<b>,<c>: redefine clock chars. Missing/empty slots
      // keep their current value (Zebra spec: defaults persist when
      // a parameter is omitted). `^` and `~` stay reserved.
      const accept = (raw: string | undefined, current: string) => {
        const c = raw?.[0];
        return c && c !== "^" && c !== "~" ? c : current;
      };
      s.clockChars = {
        date: accept(p[0], s.clockChars.date),
        time: accept(p[1], s.clockChars.time),
        tertiary: accept(p[2], s.clockChars.tertiary),
      };
    },
    FE: (p) => {
      // ^FE<char>: redefine the FN-embed delimiter used inside ^FD/^FV.
      // Single ASCII character; falls back to '#' when missing/invalid.
      const c = p[0]?.[0];
      s.embedChar = c && c !== "^" && c !== "~" ? c : "#";
    },
    // FV / FM / FP / JA / JM / JC / JD / JE / JI / JR / JS / JU / PP —
    // noops; FL / HT / LF / IM / ~DG — browser-limit factories. All
    // extracted to handlers/unsupported.ts.
  };

  Object.assign(handlers, createSetupScriptHandlers(printerProfile));
  Object.assign(handlers, createLabelConfigHandlers(labelConfig, dpmm));
  Object.assign(handlers, createUnsupportedHandlers({ skipped, browserLimit }));

  // ── Main dispatch loop ─────────────────────────────────────────────────────
  for (const { cmd, rest } of tokens) {
    const p = rest.split(",");
    const handler = handlers[cmd];
    if (handler) {
      handler(p, rest);
      continue;
    }

    // ^A{font}{rotation},{height},{width} — general font command (A0 and A@ are in the map;
    // remaining ^A* variants are dynamic keys that cannot be static map entries).
    if (cmd[0] === "A" && cmd.length === 2) {
      s.fieldType = "text";
      s.textRot = (rest[0] as TextProps["rotation"]) ?? s.fwRotation;
      s.textH = int(p[1], s.cfHeight || 30);
      s.textW = int(p[2], s.cfWidth || 0);
      const fontChar = cmd[1] ?? "";
      // Round-trip semantics: when the font character matches the
      // current ^CF, treat the field as "use the label default" and
      // leave s.pendingFontId undefined so the model carries no per-field
      // override. Otherwise pin the alias on the field so re-emitting
      // produces the same ^A{id} short form. Unknown aliases (no ^CW
      // and not a built-in) still go through — the printer would fall
      // back to font 0 at print, but storing the user's choice keeps
      // the import lossless for editing.
      if (s.cfFontId && fontChar === s.cfFontId) {
        s.pendingFontId = undefined;
      } else {
        s.pendingFontId = fontChar;
      }
      if (
        !s.fontAliases.has(fontChar) &&
        !ZPL_BUILTIN_FONT_LETTERS.includes(fontChar)
      ) {
        partialCmds.add(`^${cmd}`);
      }
      continue;
    }

    // Record unknown commands (excluding pure whitespace tokens)
    if (rest.trim() || cmd.trim()) {
      const token = `^${cmd}${rest}`;
      skipped.push(token);
      unknown.push(token);
    }
  }

  // Build findings list. `partialCmds` is deduplicated by command code;
  // the others are per-occurrence in encounter order. pageIndex stays 0
  // here; `zplImportService.importZplText` fills it once it knows which
  // ^XA…^XZ block this came from.
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
  ];

  return {
    labelConfig,
    printerProfile,
    objects,
    variables,
    skipped,
    importReport: {
      findings,
      partial: [...partialCmds],
      browserLimit,
      unknown,
    },
  };
}
