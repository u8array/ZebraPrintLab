import { getFontFamily } from "../../lib/fontCache";
import type { LabelObject } from "../../types/Group";
import { measureInkWidthPx } from "./measureTextDots";
import { ZPL_FONT_HEIGHT_TO_CSS_RATIO } from "./textPositionTransforms";

/** Shared derivation of the text/serial render metrics that both the
 *  Konva renderer (KonvaObject) and the resize commit path
 *  (useKonvaTransformer → modelPositionFromRenderedTopLeft) need.
 *
 *  Centralising here ensures the rendered position (objectToDisplay)
 *  and the inverse computed at drag-end (displayToObject) always see
 *  the same `inkWidth`; without that, FT/N text drifts up by
 *  (fontHeight_new - fontHeight_old) on every resize, and I/B
 *  rotations drift sideways by the ink-width delta. */
export interface TextRenderMetrics {
  content: string;
  fontFamily: string;
  fontScaleX: number;
  inkWidthDots: number;
}

/** Returns the metrics for a text/serial object. When `fontHeightOverride`
 *  is supplied (the resize-commit path, before the new height has
 *  been written to obj.props), it's used in place of obj.props.fontHeight. */
export function getTextRenderMetrics(
  obj: LabelObject,
  fontHeightOverride?: number,
): TextRenderMetrics | null {
  if (obj.type !== "text" && obj.type !== "serial") return null;
  const p = obj.props;
  const fontHeight = fontHeightOverride ?? p.fontHeight;
  const content = obj.type === "serial" ? `#${p.content}` : p.content;
  const printerFontName =
    obj.type === "text" ? obj.props.printerFontName : undefined;
  const fontFamily = printerFontName
    ? (getFontFamily(printerFontName) ?? "'PrintLab ZPL', sans-serif")
    : "'PrintLab ZPL', sans-serif";
  const fontScaleX = p.fontWidth > 0 ? p.fontWidth / fontHeight : 1;
  const inkWidthDots =
    measureInkWidthPx(
      content,
      fontHeight / ZPL_FONT_HEIGHT_TO_CSS_RATIO,
      fontFamily,
    ) * fontScaleX;
  return { content, fontFamily, fontScaleX, inkWidthDots };
}
