import { Line, Rect, Text } from "react-konva";
import type { ReactNode } from "react";
import { VERA_MONO_HRI_CAP_TOP_PAD } from "./bwipConstants";

// Monospace advance (cell width / em), used to estimate the centered HRI
// text's width so the glyphs flank it (assumes a monospace fontFamily, which
// the Vera/Font-A HRI is); the text itself is rendered unchanged.
const MONO_ADVANCE = 0.6;
// Cap band within the em box; matches the HRI text's glyphTopPad.
const CAP_HEIGHT = 1 - 2 * VERA_MONO_HRI_CAP_TOP_PAD;
// Triangle apex slightly obtuse (Labelary Code 11): width ~= height (~51deg).
const TRI_W_RATIO = 0.95;
const TRI_Y_SHIFT = 0.12;
// Triangle height per cap, asymmetric: small start, larger stop.
const TRI_H_START = 0.5;
const TRI_H_STOP = 0.75;
// Extra horizontal gap (per cell) so the triangle does not crowd the text.
const TRI_GAP = 0.2;
// Code 93 oblong: 0.5:1 aspect scaled to ~0.8, bottom-anchored to the baseline.
const SQ_W = 0.4;
const SQ_H = 0.8;
// The font's asterisk sits high; push it down to center it on the digit row.
const ASTERISK_Y_SHIFT = 0.2;
// Stroke width per em for the drawn triangle/square outlines.
const STROKE_RATIO = 0.06;

type Glyph = "triangle" | "square" | "asterisk";

interface BuildArgs {
  /** The HRI text already rendered (centered) by BarcodeObject. */
  text: string;
  fontFamily: string;
  fontSize: number;
  /** Upright bar left edge and width in display px. */
  barLeftPx: number;
  barW: number;
  /** Top y of the HRI text box. */
  textY: number;
  glyph: Glyph;
}

/** Start/stop markers flanking the centered HRI text: Code 11 triangle
 *  (asymmetric, small start / large stop), Code 93 oblong square, Code 39
 *  asterisk (a real glyph, but lowered to sit centered like Labelary). The
 *  text stays rendered as-is; markers sit one cell-width past its edges. */
export function buildCode1dStartStopGlyphs(a: BuildArgs): ReactNode[] {
  const { text, fontFamily, fontSize, barLeftPx, barW, textY, glyph } = a;
  const cellW = fontSize * MONO_ADVANCE;
  const capTop = textY + fontSize * VERA_MONO_HRI_CAP_TOP_PAD;
  const capH = fontSize * CAP_HEIGHT;
  const stroke = Math.max(fontSize * STROKE_RATIO, 1);
  const center = barLeftPx + barW / 2;
  const textHalf = (text.length * cellW) / 2;
  const triGap = glyph === "triangle" ? cellW * TRI_GAP : 0;
  const startCx = center - textHalf - cellW / 2 - triGap;
  const stopCx = center + textHalf + cellW / 2 + triGap;

  const make = (key: string, cx: number, isStop: boolean): ReactNode => {
    if (glyph === "asterisk") {
      // Box must exceed the glyph's measured width or Konva drops the line
      // (empty textArr -> 0x0, invisible); cellW alone is too tight.
      return (
        <Text key={key} x={cx - fontSize / 2} width={fontSize} y={textY + capH * ASTERISK_Y_SHIFT}
          text="*" fontSize={fontSize} fontFamily={fontFamily}
          align="center" wrap="none" fill="#000000" listening={false} />
      );
    }
    if (glyph === "square") {
      const w = capH * SQ_W, h = capH * SQ_H;
      const cy = capTop + capH - h / 2; // bottom-anchored to the baseline
      return (
        <Rect key={key} x={cx - w / 2} y={cy - h / 2} width={w} height={h}
          stroke="#000000" strokeWidth={stroke} listening={false} />
      );
    }
    const h = capH * (isStop ? TRI_H_STOP : TRI_H_START), w = h * TRI_W_RATIO;
    const cy = capTop + capH / 2 + capH * TRI_Y_SHIFT;
    return (
      <Line key={key} closed listening={false} stroke="#000000" strokeWidth={stroke}
        points={[cx, cy - h / 2, cx - w / 2, cy + h / 2, cx + w / 2, cy + h / 2]} />
    );
  };

  return [make("start", startCx, false), make("stop", stopCx, true)];
}
