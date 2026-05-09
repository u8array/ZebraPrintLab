/** Pure transforms between the text/serial object's saved coordinate
 *  (what ZPL persists) and the Konva-anchor coordinate (what we paint).
 *
 *  Two corrections stack:
 *    1. ^FT baseline correction (only when positionType === "FT"):
 *       ^FT places the origin at the baseline of the first character;
 *       Konva's Text anchor sits at a different corner depending on
 *       rotation. Shift accordingly so the painted text matches the
 *       baseline the ZPL describes.
 *    2. Rotation alignment (always for text/serial):
 *       Konva rotates around the top-left corner; ZPL ^FO does not
 *       behave the same way. 15 dots is an empirically determined
 *       offset that lines the canvas back up with what the printer
 *       (and Labelary) renders.
 *
 *  `displayToObject` is the exact inverse so a drag-end can recover
 *  the saved coordinate from the dragged Konva position. */

interface TextLikeProps {
  fontHeight: number;
  rotation: 'N' | 'R' | 'I' | 'B';
}

/** 15 dots empirical canvas/ZPL alignment offset for rotated text. */
const ROTATION_OFFSET_DOTS = 15;

function ftBaselineDelta(props: TextLikeProps): { dx: number; dy: number } {
  // For R/I/B the Konva anchor sits at the far end of the rendered
  // glyph, so we use the actual rendered height (fontHeight / 1.3).
  // For N the anchor is at the top, so we shift up by the full ZPL
  // fontHeight.
  const renderedH = props.fontHeight / 1.3;
  switch (props.rotation) {
    case 'N': return { dx: 0, dy: -props.fontHeight };
    case 'R': return { dx: renderedH, dy: 0 };
    case 'I': return { dx: 0, dy: renderedH };
    case 'B': return { dx: -renderedH, dy: 0 };
  }
}

function rotationOffsetDelta(props: TextLikeProps): { dx: number; dy: number } {
  switch (props.rotation) {
    case 'N': return { dx: 0, dy: 0 };
    case 'I': return { dx: 0, dy: -ROTATION_OFFSET_DOTS };
    case 'R': return { dx: -ROTATION_OFFSET_DOTS, dy: 0 };
    case 'B': return { dx: ROTATION_OFFSET_DOTS, dy: 0 };
  }
}

/** Object position → display anchor, in dot space. */
export function objectToDisplay(
  objectX: number,
  objectY: number,
  props: TextLikeProps,
  positionType: 'FO' | 'FT' | undefined,
): { x: number; y: number } {
  let x = objectX;
  let y = objectY;
  if (positionType === 'FT') {
    const ft = ftBaselineDelta(props);
    x += ft.dx;
    y += ft.dy;
  }
  const rot = rotationOffsetDelta(props);
  x += rot.dx;
  y += rot.dy;
  return { x, y };
}

/** Inverse of objectToDisplay — recovers the saved coordinate from a
 *  display anchor (used at drag end). */
export function displayToObject(
  displayX: number,
  displayY: number,
  props: TextLikeProps,
  positionType: 'FO' | 'FT' | undefined,
): { x: number; y: number } {
  let x = displayX;
  let y = displayY;
  const rot = rotationOffsetDelta(props);
  x -= rot.dx;
  y -= rot.dy;
  if (positionType === 'FT') {
    const ft = ftBaselineDelta(props);
    x -= ft.dx;
    y -= ft.dy;
  }
  return { x, y };
}
