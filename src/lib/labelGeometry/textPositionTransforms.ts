// EM-top-left <-> ZPL anchor (^FO cap-top / ^FT baseline). Applied only
// at the zplGenerator/zplParser boundary; editor interactions skip it.

interface TextLikeProps {
  fontHeight: number;
  rotation: "N" | "R" | "I" | "B";
}

export const ZPL_FONT_HEIGHT_TO_CSS_RATIO = 1.0;

/** PrintLab ascender ~1.0h vs Zebra CG Triumvirate cap ~0.78h. */
export const EM_TOP_ABOVE_CAP = 0.234;

/** Closes residual PrintLab vs Labelary cap-top mismatch (~0.08h). */
const RENDER_Y_BIAS = 0.08;

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

  // FO = ascender pad to cap-top; FT adds cap-height to baseline.
  // Bias subtracts here so printed anchor lands where editor displays.
  switch (props.rotation) {
    case "R":
      return isFT ? { dx: -h + bias, dy: 0 } : { dx: -h - pad + bias, dy: 0 };
    case "I":
      return isFT ? { dx: 0, dy: -h + bias } : { dx: -w, dy: -h - pad + bias };
    case "B":
      return isFT ? { dx: h - bias, dy: 0 } : { dx: pad - bias, dy: -w };
    case "N":
    default:
      // Unknown rotation falls through to N (malformed-input guard).
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
