import type { LabelObject } from "../types/Group";
import { diagonalPolygonPoints, outlineInset } from "./shapeGeometry";

/** Inward-extruded ^GE / ^GC ring or solid disc, shared by ellipse and
 *  circle. Extracted so the two registry types — which carry different
 *  prop shapes — can each pass their normalised width / height in
 *  without the call-site needing a union-narrowing ternary. */
function drawEllipticalOutline(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  thickness: number,
  filled: boolean,
  zplColor: "B" | "W",
): void {
  const color = zplColor === "B" ? "#000000" : "#ffffff";
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (filled) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Even-odd fill of outer ellipse minus inner ellipse — gives a true
  // inward-extruded ring (canvas stroke would be centred on the path
  // and overflow the declared bbox).
  const t = Math.max(1, thickness);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.ellipse(
    cx, cy,
    Math.max(0, w / 2 - t),
    Math.max(0, h / 2 - t),
    0, 0, Math.PI * 2,
  );
  ctx.fill("evenodd");
}

/**
 * 2D-canvas shape primitive (^GB / ^GE / ^GC / line-as-^GB) renderer.
 *
 * Test-only: the Konva canvas does not call this function. Both code
 * paths share the same geometric definitions via `lib/shapeGeometry.ts`
 * (outlineInset, diagonalPolygonPoints), and the pixel-regression
 * suite uses this 2D-canvas renderer to compare against Labelary.
 *
 * Geometry follows ZPL semantics (Option A from the design discussion):
 * outline thickness extrudes *inward* from the declared bounding box for
 * `^GB`/`^GE`/`^GC`, and *downward / rightward* from `(x, y)` for axis-
 * aligned lines. This is the print-truth geometry — what Labelary renders
 * from the same ZPL — so the canvas matches the printer 1:1.
 *
 * The caller supplies a 2D context whose units already equal ZPL dots
 * (i.e. 1 unit = 1 dot). At 8dpmm this is the same as 1 px in the
 * Labelary reference images, which is what the regression suite assumes.
 */
export function renderShape(
  ctx: CanvasRenderingContext2D,
  obj: LabelObject,
): void {
  switch (obj.type) {
    case "box": {
      const p = obj.props;
      const color = p.color === "B" ? "#000000" : "#ffffff";
      // TODO: rounding support. ^GB w,h,t,c,r accepts a 0..8 rounding
      // index that maps to corner radius (r * Math.min(w, h) / 8 in
      // dots — the formula already in KonvaObject for canvas display).
      // Implement via ctx.roundRect for outer + inner rect with
      // evenodd fill once we have a Labelary fixture with rounding>0
      // to validate against; the current fixtures all use rounding=0
      // so the four-band approach below is exact.
      const t = Math.max(1, p.thickness);
      const geom = outlineInset(p.width, p.height, t, p.filled);
      if (geom.renderFilled) {
        // `geom.width` / `geom.height` already account for the Zebra
        // `^GB w,h,t` per-axis dimension promotion (max(w,t), max(h,t))
        // so a thickness exceeding height or width extrudes the rendered
        // field accordingly, matching Labelary.
        ctx.fillStyle = color;
        ctx.fillRect(obj.x, obj.y, geom.width, geom.height);
        return;
      }
      // Four filled bands (top, bottom, left, right) avoid the
      // centred-stroke half-pixel artefacts an ellipse-style outline
      // would have for axis-aligned rects.
      ctx.fillStyle = color;
      ctx.fillRect(obj.x, obj.y, p.width, t);                          // top
      ctx.fillRect(obj.x, obj.y + p.height - t, p.width, t);           // bottom
      ctx.fillRect(obj.x, obj.y + t, t, p.height - t * 2);             // left
      ctx.fillRect(obj.x + p.width - t, obj.y + t, t, p.height - t * 2); // right
      return;
    }

    case "ellipse": {
      drawEllipticalOutline(
        ctx,
        obj.x, obj.y,
        obj.props.width, obj.props.height,
        obj.props.thickness, obj.props.filled, obj.props.color,
      );
      return;
    }

    case "circle": {
      drawEllipticalOutline(
        ctx,
        obj.x, obj.y,
        obj.props.diameter, obj.props.diameter,
        obj.props.thickness, obj.props.filled, obj.props.color,
      );
      return;
    }

    case "line": {
      const p = obj.props;
      const color = p.color === "B" ? "#000000" : "#ffffff";
      const a = ((p.angle % 360) + 360) % 360;
      const t = Math.max(1, p.thickness);

      // Axis-aligned lines map directly to ^GB rectangles. ZPL extrudes
      // thickness downward (horizontal) or rightward (vertical) from
      // (obj.x, obj.y); angle 180 / 270 mean the line *starts* at (x,y)
      // and extends in the opposite axis direction.
      ctx.fillStyle = color;
      if (a === 0) {
        ctx.fillRect(obj.x, obj.y, p.length, t);
      } else if (a === 180) {
        ctx.fillRect(obj.x - p.length, obj.y, p.length, t);
      } else if (a === 90) {
        ctx.fillRect(obj.x, obj.y, t, p.length);
      } else if (a === 270) {
        ctx.fillRect(obj.x, obj.y - p.length, t, p.length);
      } else {
        // Diagonal ^GD: derive the polygon vertices from the integer-
        // rounded line endpoints (matching line.toZPL's rounding), then
        // delegate the parallelogram geometry to shapeGeometry. The
        // Konva canvas calls the same helper, so the two render paths
        // cannot drift.
        const rad = (a * Math.PI) / 180;
        const dx = p.length * Math.cos(rad);
        const dy = p.length * Math.sin(rad);
        const ddx = Math.sign(dx) * Math.max(1, Math.abs(Math.round(dx)));
        const ddy = Math.sign(dy) * Math.max(1, Math.abs(Math.round(dy)));
        const [v0x, v0y, v1x, v1y, v2x, v2y, v3x, v3y] = diagonalPolygonPoints(
          obj.x, obj.y,
          obj.x + ddx, obj.y + ddy,
          t,
        );
        ctx.beginPath();
        ctx.moveTo(v0x, v0y);
        ctx.lineTo(v1x, v1y);
        ctx.lineTo(v2x, v2y);
        ctx.lineTo(v3x, v3y);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }

    default:
      // Non-shape objects (text, barcodes, images, serial) are out of
      // scope for this renderer — the barcode regression suite covers
      // bwip-js outputs separately. Test infrastructure only, so a
      // loud throw is intentional: any pixel-regression case that
      // smuggles a non-shape object through here is a test-author bug,
      // not a runtime condition the UI needs to survive.
      throw new Error(`renderShape: unsupported type "${(obj as { type: string }).type}"`);
  }
}
