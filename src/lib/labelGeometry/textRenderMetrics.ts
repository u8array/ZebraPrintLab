import { resolvePreviewFontName } from "../customFonts";
import { getFontFamily } from "../fontCache";
import type { LabelObject } from "../../types/Group";
import type { LabelConfig } from "../../types/LabelConfig";
import { measureInkWidthPx } from "./measureTextDots";
import { ZPL_FONT_HEIGHT_TO_CSS_RATIO } from "./textPositionTransforms";

/** Shared by renderer, resize commit, emit, parser; inkWidth drift would
 *  desync FO/I and FO/B rotations on round-trip. */
export interface TextRenderMetrics {
  content: string;
  fontFamily: string;
  fontScaleX: number;
  inkWidthDots: number;
}

/** Parser feeds these (no obj at parse time). */
export interface TextMetricsInput {
  content: string;
  fontHeight: number;
  fontWidth: number;
  printerFontName?: string;
  /** Canvas-only ^CW/^CF fallback; not passed by emit/parser. */
  defaultPrinterFontName?: string;
}

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

/** Canvas-only preview font priority: fontId -> printerFontName -> defaultFontId.
 *  Emit/parse omit `label` so round-trip stays PrintLab-based. */
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
