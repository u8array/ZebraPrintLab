import type { LabelObject } from "../../src/types/Group";

/**
 * Pixel-regression cases for the geometric primitives (box, line, ellipse,
 * circle) — analogous to `testCases.ts` for barcodes. Each entry pairs a
 * canonical `LabelObject` (used by `renderShape` to produce the local
 * canvas) with the ZPL Labelary should render as the reference.
 *
 * ZPL is stored verbatim rather than re-derived from `obj` via the registry,
 * mirroring the barcode-fixtures pattern. The registry's runtime entry
 * (`src/registry/index.ts`) transitively imports the React components and
 * the zustand store, both of which crash under plain Node — keeping the
 * ZPL inline lets the fetch script run without a DOM polyfill. The trade-
 * off is that the strings need a manual update if a shape's `toZPL`
 * changes; cross-check via `zplGenerator.test.ts`.
 *
 * Initial set deliberately covers the geometry-asymmetry cases:
 *   - thick outline boxes (^GB thickness extrudes inward)
 *   - horizontal / vertical lines of varying thickness
 *   - ellipse + circle outline (^GE thickness behaviour)
 * Anti-aliasing-only cases (thickness 1, filled solid) are kept too as a
 * baseline that should match trivially.
 *
 * Diagonal lines (`^GD`) are intentionally absent until `renderShape`
 * covers the Zebra quadrilateral geometry.
 */
export interface ShapeTestCase {
  id: string;
  obj: LabelObject;
  zpl_input: string;
  image_ref: string;
}

export const shapeTestCases: ShapeTestCase[] = [
  {
    id: "shape_box_outline_thin",
    obj: {
      id: "1",
      type: "box",
      x: 100,
      y: 100,
      rotation: 0,
      props: { width: 300, height: 200, thickness: 1, filled: false, color: "B", rounding: 0 },
    },
    zpl_input: "^XA^FO100,100^GB300,200,1,B,0^FS^XZ",
    image_ref: "shape_box_outline_thin.png",
  },
  {
    id: "shape_box_outline_thick",
    obj: {
      id: "2",
      type: "box",
      x: 100,
      y: 100,
      rotation: 0,
      props: { width: 300, height: 200, thickness: 12, filled: false, color: "B", rounding: 0 },
    },
    zpl_input: "^XA^FO100,100^GB300,200,12,B,0^FS^XZ",
    image_ref: "shape_box_outline_thick.png",
  },
  {
    // Filled box: box.toZPL substitutes thickness with min(w, h) — the
    // ZPL string below mirrors that exactly so Labelary renders a solid
    // rect. Keep in sync if `box.toZPL` changes.
    id: "shape_box_filled",
    obj: {
      id: "3",
      type: "box",
      x: 100,
      y: 100,
      rotation: 0,
      props: { width: 300, height: 200, thickness: 1, filled: true, color: "B", rounding: 0 },
    },
    zpl_input: "^XA^FO100,100^GB300,200,200,B,0^FS^XZ",
    image_ref: "shape_box_filled.png",
  },
  {
    id: "shape_line_horizontal_thick",
    obj: {
      id: "4",
      type: "line",
      x: 100,
      y: 200,
      rotation: 0,
      props: { angle: 0, length: 400, thickness: 10, color: "B" },
    },
    zpl_input: "^XA^FO100,200^GB400,10,10,B,0^FS^XZ",
    image_ref: "shape_line_horizontal_thick.png",
  },
  {
    id: "shape_line_vertical_thick",
    obj: {
      id: "5",
      type: "line",
      x: 200,
      y: 100,
      rotation: 0,
      props: { angle: 90, length: 400, thickness: 10, color: "B" },
    },
    zpl_input: "^XA^FO200,100^GB10,400,10,B,0^FS^XZ",
    image_ref: "shape_line_vertical_thick.png",
  },
  {
    id: "shape_ellipse_outline",
    obj: {
      id: "7",
      type: "ellipse",
      x: 100,
      y: 100,
      rotation: 0,
      props: { width: 300, height: 200, thickness: 8, filled: false, color: "B" },
    },
    zpl_input: "^XA^FO100,100^GE300,200,8,B^FS^XZ",
    image_ref: "shape_ellipse_outline.png",
  },
  {
    id: "shape_circle_outline",
    obj: {
      id: "8",
      type: "circle",
      x: 100,
      y: 100,
      rotation: 0,
      props: { diameter: 200, thickness: 8, filled: false, color: "B" },
    },
    zpl_input: "^XA^FO100,100^GE200,200,8,B^FS^XZ",
    image_ref: "shape_circle_outline.png",
  },

  // Reverse-direction lines — angle 180 / 270 extend the body backward
  // from (x, y). The renderer maps this to ^GB at (x - length, y) /
  // (x, y - length); the ZPL strings below precompute that shift so
  // Labelary positions the same band.
  {
    id: "shape_line_horizontal_left",
    obj: {
      id: "9",
      type: "line",
      x: 500,
      y: 200,
      rotation: 0,
      props: { angle: 180, length: 400, thickness: 10, color: "B" },
    },
    zpl_input: "^XA^FO100,200^GB400,10,10,B,0^FS^XZ",
    image_ref: "shape_line_horizontal_left.png",
  },
  {
    id: "shape_line_vertical_up",
    obj: {
      id: "10",
      type: "line",
      x: 200,
      y: 500,
      rotation: 0,
      props: { angle: 270, length: 400, thickness: 10, color: "B" },
    },
    zpl_input: "^XA^FO200,100^GB10,400,10,B,0^FS^XZ",
    image_ref: "shape_line_vertical_up.png",
  },

  // Thickness sweep — odd, larger, and right at the filled-clamp edge
  // (Zebra renders ^GB with `2 * thickness >= min(w, h)` as solid; for
  // 300×200 the threshold is t = 100, so t=99 is the densest still-
  // outline case and proves the clamp boundary).
  {
    id: "shape_box_outline_t3",
    obj: {
      id: "11",
      type: "box",
      x: 100,
      y: 100,
      rotation: 0,
      props: { width: 300, height: 200, thickness: 3, filled: false, color: "B", rounding: 0 },
    },
    zpl_input: "^XA^FO100,100^GB300,200,3,B,0^FS^XZ",
    image_ref: "shape_box_outline_t3.png",
  },
  {
    id: "shape_box_outline_t20",
    obj: {
      id: "12",
      type: "box",
      x: 100,
      y: 100,
      rotation: 0,
      props: { width: 300, height: 200, thickness: 20, filled: false, color: "B", rounding: 0 },
    },
    zpl_input: "^XA^FO100,100^GB300,200,20,B,0^FS^XZ",
    image_ref: "shape_box_outline_t20.png",
  },
  {
    id: "shape_box_outline_near_filled",
    obj: {
      id: "13",
      type: "box",
      x: 100,
      y: 100,
      rotation: 0,
      props: { width: 300, height: 200, thickness: 99, filled: false, color: "B", rounding: 0 },
    },
    zpl_input: "^XA^FO100,100^GB300,200,99,B,0^FS^XZ",
    image_ref: "shape_box_outline_near_filled.png",
  },
  {
    id: "shape_line_horizontal_t1",
    obj: {
      id: "14",
      type: "line",
      x: 100,
      y: 300,
      rotation: 0,
      props: { angle: 0, length: 400, thickness: 1, color: "B" },
    },
    zpl_input: "^XA^FO100,300^GB400,1,1,B,0^FS^XZ",
    image_ref: "shape_line_horizontal_t1.png",
  },
  {
    id: "shape_line_horizontal_t3",
    obj: {
      id: "15",
      type: "line",
      x: 100,
      y: 350,
      rotation: 0,
      props: { angle: 0, length: 400, thickness: 3, color: "B" },
    },
    zpl_input: "^XA^FO100,350^GB400,3,3,B,0^FS^XZ",
    image_ref: "shape_line_horizontal_t3.png",
  },

  // Diagonal lines (^GD) — Labelary fixtures fetched up front so the
  // renderer implementation in Phase 2 can iterate offline. Tests for
  // these IDs are skipped until renderShape supports ^GD geometry; the
  // skip predicate lives in shapeRegression.test.ts.
  //
  // ZPL strings were derived from line.toZPL's diagonal branch
  // (Math.cos/sin → dx/dy → w/h/orientation/boxX/boxY).
  {
    id: "shape_line_diag_slash_45",
    obj: {
      id: "16",
      type: "line",
      x: 100,
      y: 500,
      rotation: 0,
      props: { angle: -45, length: 400, thickness: 6, color: "B" },
    },
    // angle 315°: dx=+283, dy=-283 → boxY shifts up by 283
    zpl_input: "^XA^FO100,217^GD283,283,6,B,R^FS^XZ",
    image_ref: "shape_line_diag_slash_45.png",
  },
  {
    id: "shape_line_diag_backslash_45",
    obj: {
      id: "17",
      type: "line",
      x: 100,
      y: 100,
      rotation: 0,
      props: { angle: 45, length: 400, thickness: 6, color: "B" },
    },
    zpl_input: "^XA^FO100,100^GD283,283,6,B,L^FS^XZ",
    image_ref: "shape_line_diag_backslash_45.png",
  },
  {
    id: "shape_line_diag_shallow",
    obj: {
      id: "18",
      type: "line",
      x: 100,
      y: 200,
      rotation: 0,
      props: { angle: 30, length: 400, thickness: 6, color: "B" },
    },
    zpl_input: "^XA^FO100,200^GD346,200,6,B,L^FS^XZ",
    image_ref: "shape_line_diag_shallow.png",
  },
  {
    id: "shape_line_diag_steep",
    obj: {
      id: "19",
      type: "line",
      x: 100,
      y: 200,
      rotation: 0,
      props: { angle: 60, length: 400, thickness: 6, color: "B" },
    },
    zpl_input: "^XA^FO100,200^GD200,346,6,B,L^FS^XZ",
    image_ref: "shape_line_diag_steep.png",
  },
];
