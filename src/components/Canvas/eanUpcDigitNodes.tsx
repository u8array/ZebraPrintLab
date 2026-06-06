import { Text } from "react-konva";
import type { ReactNode } from "react";
import type { EanUpcType } from "./bwipHelpers";

/** Visual gap in display px between the UPC-E bar end and the floated
 *  check digit. Chosen by eye to match the Labelary render; the digit
 *  sits just past the quiet-zone boundary, not flush against the bars. */
const UPCE_TRAIL_DIGIT_GAP_PX = 2;

/** Result of building the EAN/UPC digit overlay: the Konva text nodes
 *  plus the clip-expansion needed on the parent Group so floated
 *  sys/trail digits stay visible. `clipLeft`/`clipRight` are dots
 *  beyond the bar's upright x-range (0..barW) the parent must reserve;
 *  consumers without clipping can ignore them. */
export interface EanUpcDigitOverlay {
  nodes: ReactNode[];
  clipLeft: number;
  clipRight: number;
}

interface BuildArgs {
  type: EanUpcType;
  displayText: string;
  layout: { xLeft: number; xRight: number; halfWidth: number };
  /** Upright bar width in display px; used as the right anchor for
   *  the UPC-E trail digit (sits 2px past the bar end). */
  uprightBarW: number;
  /** Upright bar height in display px; text Y = uprightBarH + textGap. */
  uprightBarH: number;
  textGap: number;
  textFontSize: number;
}

/** Build the digit-by-digit HRI overlay for EAN-13 / EAN-8 / UPC-A /
 *  UPC-E in upright coords. Single source of truth shared by the
 *  upright printInterp branch and the rotated inner-Group branch in
 *  BarcodeObject; both produce identical digit positions, only the
 *  parent wrapper differs (upright clips the bbox; rotated wraps in a
 *  rotatedGroupTransform Group). */
export function buildEanUpcDigitOverlay(args: BuildArgs): EanUpcDigitOverlay {
  const { type, displayText, layout, uprightBarW, uprightBarH, textGap, textFontSize } = args;
  const ldW = textFontSize * 1.2;
  const textY = Math.max(uprightBarH, 1) + textGap;
  const { xLeft, xRight, halfWidth: halfW } = layout;

  const tStyle = {
    y: textY,
    fontSize: textFontSize,
    fontFamily: "'Courier New', monospace" as const,
    fontStyle: "bold" as const,
    wrap: "none" as const,
    fill: "#000000",
    listening: false,
  };

  const main = (key: string, x: number, width: number, text: string) =>
    <Text key={key} x={x} width={Math.max(width, 1)} text={text} align="center" {...tStyle} />;
  const sys = (text: string) =>
    <Text key="sys" x={-ldW} width={ldW} text={text} align="center" {...tStyle} />;
  const trail = (text: string) =>
    <Text key="trail" x={uprightBarW + UPCE_TRAIL_DIGIT_GAP_PX} width={ldW} text={text} align="left" {...tStyle} />;

  switch (type) {
    case "ean13":
      return {
        clipLeft: ldW,
        clipRight: 0,
        nodes: [
          sys(displayText[0] ?? ""),
          main("left", xLeft, halfW, displayText.slice(1, 7)),
          main("right", xRight, halfW, displayText.slice(7, 13)),
        ],
      };
    case "ean8":
      return {
        clipLeft: 0,
        clipRight: 0,
        nodes: [
          main("left", xLeft, halfW, displayText.slice(0, 4)),
          main("right", xRight, halfW, displayText.slice(4, 8)),
        ],
      };
    case "upca":
      // UPC-A HRI: number system (1) | 5 manuf | 5 product | check (1).
      // System digit floats left of the bars, check digit floats right;
      // matches Zebra's ^BU default (checkDigit=Y) which the generator
      // now emits.
      return {
        clipLeft: ldW,
        clipRight: ldW,
        nodes: [
          sys(displayText[0] ?? ""),
          main("left", xLeft, halfW, displayText.slice(1, 6)),
          main("right", xRight, halfW, displayText.slice(6, 11)),
          trail(displayText[11] ?? ""),
        ],
      };
    case "upce":
      return {
        clipLeft: ldW,
        clipRight: ldW,
        nodes: [
          sys(displayText[0] ?? "0"),
          main("mid", xLeft, halfW, displayText.slice(1, 7)),
          trail(displayText[7] ?? ""),
        ],
      };
  }
}
