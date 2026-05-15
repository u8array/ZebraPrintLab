/** Pure transforms between the text/serial object's saved coordinate
 *  (what ZPL persists) and the Konva-anchor coordinate (what we paint).
 *
 *  Konva's `<Text>` anchors at the EM-box top-left and rotates around
 *  that anchor. Zebra's two position modes anchor differently:
 *    - ^FO at the cap-top of the first character (= cell-top-left
 *      before rotation, with cap inset from cell-top by ascender
 *      padding)
 *    - ^FT at the baseline of the first character
 *  After rotation, the cell extends right and down from ^FO in Zebra's
 *  model (the rotation flips the glyph orientation inside the cell, it
 *  does NOT rotate the cell itself). Konva on the other hand rotates
 *  the whole node around its anchor, so the rendered bbox lands in a
 *  different direction. The shifts below collapse those two semantics
 *  back together, parameterised on `inkWidth` because the I and B
 *  rotations need the rendered text width to compensate for Konva's
 *  rotation pivoting around (x, y).
 *
 *  All measurements were derived empirically by rendering single-
 *  glyph anchor probes through Labelary and fitting the shift table
 *  to the observed bbox positions. `displayToObject` is the exact
 *  inverse of `objectToDisplay` so a drag-end can recover the saved
 *  coordinate from the dragged Konva position. */

interface TextLikeProps {
  fontHeight: number;
  rotation: "N" | "R" | "I" | "B";
}

/** Ratio between ZPL fontHeight and the Konva fontSize that yields a
 *  rendered glyph height close to what Zebra firmware produces.
 *  Kept here because both the anchor math and the text/serial render
 *  paths consume it. */
export const ZPL_FONT_HEIGHT_TO_CSS_RATIO = 1.0;

/** Pre-rotation distance from EM-top to cap-top as a fraction of
 *  fontHeight. PrintLab ZPL Bold has ascender ≈ EM-box (~1.0·h) while
 *  Zebra's CG Triumvirate cap reaches ~0.78·h. */
export const EM_TOP_ABOVE_CAP = 0.234;

/** Small additional offset applied along the text's own "down" axis,
 *  i.e. in pre-rotation +Y for every rotation. PrintLab's hhea
 *  ascender sits higher than CG Triumvirate's, so Konva paints our
 *  cap-top a few dots above where Labelary draws Zebra's — visible
 *  across both ^FO and ^FT once the rotation-specific shift is
 *  correct. ≈ 0.08·fontHeight closes the gap empirically without
 *  over-correcting at smaller sizes. */
const RENDER_Y_BIAS = 0.08;

function anchorDelta(
  props: TextLikeProps,
  positionType: "FO" | "FT" | undefined,
  inkWidth: number,
): { dx: number; dy: number } {
  const h = props.fontHeight / ZPL_FONT_HEIGHT_TO_CSS_RATIO;
  const pad = props.fontHeight * EM_TOP_ABOVE_CAP;
  const bias = props.fontHeight * RENDER_Y_BIAS;
  const isFT = positionType === "FT";

  // For each rotation × positionType, the value is "how far must the
  // Konva anchor sit from the ZPL anchor so the rendered bbox matches
  // what Labelary draws". I and B depend on the ink width because
  // Konva pivots its rotation at (x, y) while Zebra keeps the cell
  // anchored at (x, y) in pre-rotation orientation.
  //
  // RENDER_Y_BIAS shifts the anchor along the text's own "down" axis
  // (cap-to-baseline) so a Konva-font ascender mismatch doesn't pull
  // the visible cap above where Labelary draws it. Per rotation, text-
  // frame "down" lands at:
  //   N: screen +Y    R: screen -X    I: screen -Y    B: screen +X
  switch (props.rotation) {
    case "N":
      return isFT
        ? { dx: 0, dy: -h + bias }
        : { dx: 0, dy: -pad + bias };
    case "R":
      return isFT
        ? { dx: h - bias, dy: 0 }
        : { dx: h + pad - bias, dy: 0 };
    case "I":
      return isFT
        ? { dx: 0, dy: h - bias }
        : { dx: inkWidth, dy: h + pad - bias };
    case "B":
      return isFT
        ? { dx: -h + bias, dy: 0 }
        : { dx: -pad + bias, dy: inkWidth };
  }
}

/** Object position → display anchor, in dot space. `inkWidth` is the
 *  rendered width of the text content at the current fontSize; only
 *  the I and B FO rotations consume it, but the parameter is required
 *  on every call so the shift table stays in one place. */
export function objectToDisplay(
  objectX: number,
  objectY: number,
  props: TextLikeProps,
  positionType: "FO" | "FT" | undefined,
  inkWidth = 0,
): { x: number; y: number } {
  const d = anchorDelta(props, positionType, inkWidth);
  return { x: objectX + d.dx, y: objectY + d.dy };
}

/** Inverse of objectToDisplay — recovers the saved coordinate from a
 *  display anchor (used at drag end). */
export function displayToObject(
  displayX: number,
  displayY: number,
  props: TextLikeProps,
  positionType: "FO" | "FT" | undefined,
  inkWidth = 0,
): { x: number; y: number } {
  const d = anchorDelta(props, positionType, inkWidth);
  return { x: displayX - d.dx, y: displayY - d.dy };
}
