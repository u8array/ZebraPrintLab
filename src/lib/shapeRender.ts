import type { LabelObject } from "../registry";
import { diagonalPolygonPoints } from "./shapeGeometry";

/**
 * 2D-canvas shape primitive (^GB / ^GE / ^GC / line-as-^GB) renderer.
 *
 * Phase 2 will refactor the Konva canvas components in `KonvaObject.tsx`
 * and `LineObject.tsx` to consume this function so the on-screen designer
 * and the pixel regression suite produce identical output by construction.
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
      if (p.filled) {
        ctx.fillStyle = color;
        ctx.fillRect(obj.x, obj.y, p.width, p.height);
        return;
      }
      const t = Math.max(1, p.thickness);
      // Outline that extrudes inward — clamps to filled rect when the
      // outline would meet itself in the middle (Zebra firmware does the
      // same: ^GB with thickness >= min(w, h)/2 renders solid).
      if (t * 2 >= Math.min(p.width, p.height)) {
        ctx.fillStyle = color;
        ctx.fillRect(obj.x, obj.y, p.width, p.height);
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

    case "ellipse":
    case "circle": {
      const p = obj.props;
      const w = obj.type === "circle" ? p.diameter : p.width;
      const h = obj.type === "circle" ? p.diameter : p.height;
      const color = p.color === "B" ? "#000000" : "#ffffff";
      const cx = obj.x + w / 2;
      const cy = obj.y + h / 2;

      if (p.filled) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      const t = Math.max(1, p.thickness);
      // Even-odd fill of outer ellipse minus inner ellipse — gives a true
      // inward-extruded ring (canvas stroke would be centred on the path
      // and overflow the declared bbox).
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
      // bwip-js outputs separately.
      throw new Error(`renderShape: unsupported type "${(obj as { type: string }).type}"`);
  }
}
