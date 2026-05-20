import { resolvePreviewFontName } from "../../lib/customFonts";
import { getFontFamily } from "../../lib/fontCache";
import type { LabelObject } from "../../types/Group";
import type { LabelConfig } from "../../types/ObjectType";
import { measureInkWidthPx } from "./measureTextDots";
import { ZPL_FONT_HEIGHT_TO_CSS_RATIO } from "./textPositionTransforms";

/** Shared text/serial render metrics used by every consumer of the
 *  rendered glyph dimensions — the Konva renderer, the resize commit
 *  path, the ZPL emit path (textFieldPos), and the ZPL parser. Single
 *  source of truth so they all measure the same way; without that, the
 *  inkWidth that goes into `modelToZplAnchor` at emit time would
 *  disagree with the one at parse time and round-trips would drift on
 *  FO/I and FO/B (the two rotations whose shift depends on text width). */
export interface TextRenderMetrics {
  content: string;
  fontFamily: string;
  fontScaleX: number;
  inkWidthDots: number;
}

/** Raw inputs for the metrics primitive — the parser feeds these
 *  directly because at parse time there's no `obj` yet. */
export interface TextMetricsInput {
  content: string;
  fontHeight: number;
  fontWidth: number;
  printerFontName?: string;
  /** Canvas-only fallback used when `printerFontName` is empty. Lets
   *  the renderer apply the label-wide default font (resolved from
   *  ^CW / ^CF) to text fields that did not pick their own printer
   *  font. Not passed by emit/parser, so the ZPL round-trip stays
   *  PrintLab-ZPL based. */
  defaultPrinterFontName?: string;
}

/** Compute metrics from raw text parameters. Pure once
 *  `measureInkWidthPx` and `getFontFamily` are pure. */
export function computeTextRenderMetrics(input: TextMetricsInput): TextRenderMetrics {
  const { content, fontHeight, fontWidth, printerFontName, defaultPrinterFontName } = input;
  const effectiveFontName = printerFontName || defaultPrinterFontName;
  const fontFamily = effectiveFontName
    ? (getFontFamily(effectiveFontName) ?? "'PrintLab ZPL', sans-serif")
    : "'PrintLab ZPL', sans-serif";
  const fontScaleX = fontWidth > 0 ? fontWidth / fontHeight : 1;
  const inkWidthDots =
    measureInkWidthPx(
      content,
      fontHeight / ZPL_FONT_HEIGHT_TO_CSS_RATIO,
      fontFamily,
    ) * fontScaleX;
  return { content, fontFamily, fontScaleX, inkWidthDots };
}

/** Object-shaped wrapper used by the renderer and the resize commit
 *  path. `fontHeightOverride` lets the resize commit see the
 *  to-be-written fontHeight before it lands in obj.props.
 *
 *  `label` is the canvas-only context used to resolve preview fonts.
 *  Priority order matches the generator's `^A` priority:
 *    1. text-level `fontId` → preview TTF for that alias
 *    2. text-level `printerFontName` (legacy filename form)
 *    3. label `defaultFontId` → preview TTF for the global default
 *  The emit path (`textFieldPos`) and the parser intentionally call
 *  this without `label`, so their ink-width measurements stay
 *  PrintLab-ZPL based and the ZPL round-trip is unaffected. */
export function getTextRenderMetrics(
  obj: LabelObject,
  fontHeightOverride?: number,
  label?: Pick<LabelConfig, "customFonts" | "defaultFontId">,
): TextRenderMetrics | null {
  if (obj.type !== "text" && obj.type !== "serial") return null;
  const p = obj.props;
  const fieldFontId = obj.type === "text" ? obj.props.fontId : undefined;
  const fieldPrinterFontName =
    obj.type === "text" ? obj.props.printerFontName : undefined;
  const printerFontName = label
    ? (resolvePreviewFontName(label, fieldFontId) ?? fieldPrinterFontName)
    : fieldPrinterFontName;
  const defaultPrinterFontName = label
    ? resolvePreviewFontName(label, label.defaultFontId)
    : undefined;
  return computeTextRenderMetrics({
    content: obj.type === "serial" ? `#${p.content}` : p.content,
    fontHeight: fontHeightOverride ?? p.fontHeight,
    fontWidth: p.fontWidth,
    printerFontName,
    defaultPrinterFontName,
  });
}
