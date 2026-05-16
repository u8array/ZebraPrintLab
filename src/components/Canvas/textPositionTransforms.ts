/** Pure transforms between the text/serial object's stored coordinate
 *  (now: Konva-render position == visual bbox top-left) and the ZPL
 *  anchor position. Used at the ZPL I/O boundary only:
 *    - zplGenerator: obj.x/y → ZPL ^FO/^FT coordinate
 *    - zplParser: parsed ^FO/^FT coordinate → obj.x/y
 *  All in-editor interactions (drag, resize, snap, smart-align) operate
 *  on obj.x/y directly with no shift between rendered position and
 *  storage, so the interaction layer is shape-agnostic.
 *
 *  The shift table maps "what Konva paints" (EM-top-left of the rotated
 *  text node) to "where Zebra anchors the field":
 *    - ^FO at the cap-top of the first character (inset from the EM-top
 *      by the ascender padding)
 *    - ^FT at the baseline of the first character
 *  After the rotation, the cap-top / baseline reference moves to a
 *  different edge of the rotated bbox; the per-rotation switch below
 *  handles that. */

interface TextLikeProps {
  fontHeight: number;
  rotation: "N" | "R" | "I" | "B";
}

/** Ratio between ZPL fontHeight and the Konva fontSize that yields a
 *  rendered glyph height close to what Zebra firmware produces. */
export const ZPL_FONT_HEIGHT_TO_CSS_RATIO = 1.0;

/** Pre-rotation distance from EM-top to cap-top as a fraction of
 *  fontHeight. PrintLab ZPL Bold has ascender ≈ EM-box (~1.0·h) while
 *  Zebra's CG Triumvirate cap reaches ~0.78·h. */
export const EM_TOP_ABOVE_CAP = 0.234;

/** Small additional offset applied along the text's own "down" axis to
 *  close the residual mismatch between PrintLab's rendered cap-top and
 *  Labelary's cap-top across both ^FO and ^FT. ≈ 0.08·fontHeight. */
const RENDER_Y_BIAS = 0.08;

/** Offset from Konva's EM-top-left (== obj.x/y) to the ZPL field
 *  anchor (^FO cap-top or ^FT baseline), in dot space, mapped through
 *  the rotation. Positive: ZPL anchor sits at obj + delta. */
function zplAnchorDelta(
  props: TextLikeProps,
  positionType: "FO" | "FT" | undefined,
  inkWidthDots = 0,
): { dx: number; dy: number } {
  const h = props.fontHeight / ZPL_FONT_HEIGHT_TO_CSS_RATIO;
  const pad = props.fontHeight * EM_TOP_ABOVE_CAP;
  const bias = props.fontHeight * RENDER_Y_BIAS;
  const isFT = positionType === "FT";
  const w = inkWidthDots;

  // For each rotation, the FO offset is the ascender padding from EM-top
  // to cap-top; the FT offset adds cap-height to land at the baseline.
  // The bias counter-shifts the editor render so cap-tops align with
  // Labelary's pixel-perfectly; here it gets subtracted from the ZPL
  // delta so the printed anchor lands where the editor displays it.
  switch (props.rotation) {
    case "R":
      return isFT ? { dx: -h + bias, dy: 0 } : { dx: -h - pad + bias, dy: 0 };
    case "I":
      return isFT ? { dx: 0, dy: -h + bias } : { dx: -w, dy: -h - pad + bias };
    case "B":
      return isFT ? { dx: h - bias, dy: 0 } : { dx: pad - bias, dy: -w };
    case "N":
    default:
      // Unknown rotation values get the N treatment so malformed inputs
      // can't propagate `undefined` through the math.
      return isFT ? { dx: 0, dy: h - bias } : { dx: 0, dy: pad - bias };
  }
}

/** obj.x/y (Konva render position) → ZPL anchor coordinate. */
export function modelToZplAnchor(
  objectX: number,
  objectY: number,
  props: TextLikeProps,
  positionType: "FO" | "FT" | undefined,
  inkWidthDots = 0,
): { x: number; y: number } {
  const d = zplAnchorDelta(props, positionType, inkWidthDots);
  return { x: objectX + d.dx, y: objectY + d.dy };
}

/** ZPL anchor coordinate (parsed from ^FO/^FT) → obj.x/y storage. */
export function zplAnchorToModel(
  anchorX: number,
  anchorY: number,
  props: TextLikeProps,
  positionType: "FO" | "FT" | undefined,
  inkWidthDots = 0,
): { x: number; y: number } {
  const d = zplAnchorDelta(props, positionType, inkWidthDots);
  return { x: anchorX - d.dx, y: anchorY - d.dy };
}
