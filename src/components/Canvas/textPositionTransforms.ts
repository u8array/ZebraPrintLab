/** Pure transforms between the text/serial object's saved coordinate
 *  (what ZPL persists) and the Konva-anchor coordinate (what we paint).
 *
 *  The single correction is the ^FT baseline shift: ^FT places the
 *  origin at the baseline of the first character while Konva's Text
 *  anchor sits at a different corner depending on rotation. ^FO needs
 *  no correction, so the transforms are the identity in that case.
 *
 *  `displayToObject` is the exact inverse of `objectToDisplay` so a
 *  drag-end can recover the saved coordinate from the dragged Konva
 *  position. */

interface TextLikeProps {
  fontHeight: number;
  rotation: "N" | "R" | "I" | "B";
}

/** Ratio between ZPL fontHeight (cap-height) and CSS/Konva fontSize
 *  (em-height) for Roboto Condensed Bold. Empirical: divide ZPL
 *  fontHeight by this to get the Konva-rendered height in dots, or to
 *  derive the Konva fontSize. Lives here because it appears in both
 *  the FT baseline math and the text/serial render paths. */
export const ZPL_FONT_HEIGHT_TO_CSS_RATIO = 1.3;

function ftBaselineDelta(props: TextLikeProps): { dx: number; dy: number } {
  // For R/I/B the Konva anchor sits at the far end of the rendered
  // glyph, so we use the actual rendered height. For N the anchor is
  // at the top, so we shift up by the full ZPL fontHeight.
  const renderedH = props.fontHeight / ZPL_FONT_HEIGHT_TO_CSS_RATIO;
  switch (props.rotation) {
    case "N":
      return { dx: 0, dy: -props.fontHeight };
    case "R":
      return { dx: renderedH, dy: 0 };
    case "I":
      return { dx: 0, dy: renderedH };
    case "B":
      return { dx: -renderedH, dy: 0 };
  }
}

/** Object position → display anchor, in dot space. */
export function objectToDisplay(
  objectX: number,
  objectY: number,
  props: TextLikeProps,
  positionType: "FO" | "FT" | undefined,
): { x: number; y: number } {
  if (positionType !== "FT") return { x: objectX, y: objectY };
  const ft = ftBaselineDelta(props);
  return { x: objectX + ft.dx, y: objectY + ft.dy };
}

/** Inverse of objectToDisplay — recovers the saved coordinate from a
 *  display anchor (used at drag end). */
export function displayToObject(
  displayX: number,
  displayY: number,
  props: TextLikeProps,
  positionType: "FO" | "FT" | undefined,
): { x: number; y: number } {
  if (positionType !== "FT") return { x: displayX, y: displayY };
  const ft = ftBaselineDelta(props);
  return { x: displayX - ft.dx, y: displayY - ft.dy };
}
