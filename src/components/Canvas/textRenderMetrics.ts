import { getFontFamily } from "../../lib/fontCache";
import type { LabelObject } from "../../types/Group";
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
}

/** Compute metrics from raw text parameters. Pure once
 *  `measureInkWidthPx` and `getFontFamily` are pure. */
export function computeTextRenderMetrics(input: TextMetricsInput): TextRenderMetrics {
  const { content, fontHeight, fontWidth, printerFontName } = input;
  const fontFamily = printerFontName
    ? (getFontFamily(printerFontName) ?? "'PrintLab ZPL', sans-serif")
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
 *  to-be-written fontHeight before it lands in obj.props. */
export function getTextRenderMetrics(
  obj: LabelObject,
  fontHeightOverride?: number,
): TextRenderMetrics | null {
  if (obj.type !== "text" && obj.type !== "serial") return null;
  const p = obj.props;
  return computeTextRenderMetrics({
    content: obj.type === "serial" ? `#${p.content}` : p.content,
    fontHeight: fontHeightOverride ?? p.fontHeight,
    fontWidth: p.fontWidth,
    printerFontName: obj.type === "text" ? obj.props.printerFontName : undefined,
  });
}
