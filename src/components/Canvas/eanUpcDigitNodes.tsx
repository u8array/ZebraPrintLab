import { Text } from "react-konva";
import type { ReactNode } from "react";
import type { EanUpcHriFragment } from "./bwipHelpers";

/** bwip's HRI module x is offset ~1 module right of the digit's bar
 *  cell; shifting it back centers each digit over its bars, matching
 *  the Labelary render. */
const BWIP_TXT_X_SHIFT_MODULES = -1;

/** Konva text nodes plus the clip the parent Group must reserve (display
 *  px beyond 0..barW) so floated system/check digits stay visible. */
export interface EanUpcDigitOverlay {
  nodes: ReactNode[];
  clipLeft: number;
  clipRight: number;
}

interface BuildArgs {
  /** HRI digits with bwip module positions (see getEanUpcHriFragments). */
  fragments: EanUpcHriFragment[];
  /** Display px per encoded bwip module. */
  modulePx: number;
  /** Upright bar width in display px. */
  uprightBarW: number;
  /** Upright bar height in display px; text Y = uprightBarH + textGap. */
  uprightBarH: number;
  textGap: number;
  textFontSize: number;
  /** Vera (mw 1-2) or OCR-B (mw 3+); see eanUpcHriFontFamily. */
  fontFamily: string;
}

/** EAN/UPC HRI overlay from bwip's text fragments: each digit centered on
 *  its module position, so floats and guard-splits stay grid-accurate at
 *  any width without hand-tuned offsets. */
export function buildEanUpcDigitOverlay(args: BuildArgs): EanUpcDigitOverlay {
  const { fragments, modulePx, uprightBarW, uprightBarH, textGap, textFontSize, fontFamily } = args;
  const textY = Math.max(uprightBarH, 1) + textGap;

  // Font switches Vera/OCR-B by module width (eanUpcHriFontFamily).
  // height + verticalAlign bottom anchor every digit on one baseline.
  const baseStyle = {
    y: textY,
    height: textFontSize,
    verticalAlign: "bottom" as const,
    fontFamily,
    fontStyle: "normal" as const,
    align: "center" as const,
    wrap: "none" as const,
    fill: "#000000",
    listening: false,
  };

  let minX = 0;
  let maxX = uprightBarW;
  const nodes: ReactNode[] = fragments.map((f, i) => {
    // Box wider/taller than the glyph; align center + verticalAlign bottom
    // do the placement, real spacing comes from xModule.
    const boxW = textFontSize;
    const x = (f.xModule + BWIP_TXT_X_SHIFT_MODULES) * modulePx - boxW / 2;
    if (x < minX) minX = x;
    if (x + boxW > maxX) maxX = x + boxW;
    return (
      <Text key={`hri${i}`} x={x} width={boxW} text={f.char} fontSize={textFontSize} {...baseStyle} />
    );
  });

  return {
    nodes,
    clipLeft: Math.max(0, -minX),
    clipRight: Math.max(0, maxX - uprightBarW),
  };
}
