import { describe, it, expect } from "vitest";
import { printerPreviewLayout, type PrinterRenderDims } from "./printerPreview";

// The measured ZD230 shape: 832-dot head, ^PW800 centered at x 16..815, content
// from the top (contentTop 0).
const dims = (over: Partial<PrinterRenderDims>): PrinterRenderDims => ({
  width: 832,
  height: 800,
  contentLeft: 40,
  contentRight: 700,
  contentTop: 0,
  contentBottom: 750,
  ...over,
});

const label = { width: 800, height: 800 };

// Hatch rects must not overlap and must not leave a genuine mismatch gap.
const area = (r: { width: number; height: number }) => r.width * r.height;
const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("printerPreviewLayout", () => {
  it("anchors the crop at the centering offset so content is not shifted", () => {
    const layout = printerPreviewLayout(dims({}), label);
    expect(layout.crop).toEqual({ x: 16, y: 0, width: 800, height: 800 });
    expect(layout.hatches).toEqual([]);
  });

  it("keeps the origin for edge-justified firmware (content left of center)", () => {
    const layout = printerPreviewLayout(dims({ contentLeft: 0 }), label);
    expect(layout.crop.x).toBe(0);
  });

  it("crops top padding symmetrically for a vertically-centered render", () => {
    const centered = dims({ height: 1000, contentTop: 100, contentBottom: 900 });
    const layout = printerPreviewLayout(centered, label);
    expect(layout.crop).toEqual({ x: 16, y: 100, width: 800, height: 800 });
    expect(layout.hatches).toEqual([]);
  });

  it("hatches content that reaches past the label width", () => {
    const layout = printerPreviewLayout(dims({ contentRight: 832 }), label);
    expect(layout.crop).toEqual({ x: 16, y: 0, width: 816, height: 800 });
    expect(layout.hatches).toEqual([{ x: 800, y: 0, width: 16, height: 800 }]);
  });

  it("hatches media overlength only when content extends into it", () => {
    const long = dims({ height: 1200, contentBottom: 780 });
    expect(printerPreviewLayout(long, label).hatches).toEqual([]);
    const overflowing = dims({ height: 1200, contentBottom: 900 });
    const layout = printerPreviewLayout(overflowing, label);
    expect(layout.crop.height).toBe(900);
    expect(layout.hatches).toEqual([{ x: 0, y: 800, width: 800, height: 100 }]);
  });

  it("hatches the label strip a too-small bitmap cannot cover", () => {
    const narrow = dims({ width: 600, contentLeft: 0, contentRight: 600 });
    const layout = printerPreviewLayout(narrow, label);
    expect(layout.crop.width).toBe(600);
    expect(layout.hatches).toEqual([{ x: 600, y: 0, width: 200, height: 800 }]);
  });

  it("covers the corner exactly once when content overflows both axes", () => {
    const both = dims({ contentRight: 832, height: 1000, contentBottom: 900 });
    const layout = printerPreviewLayout(both, label);
    expect(layout.crop).toEqual({ x: 16, y: 0, width: 816, height: 900 });
    // Overhang corner [800..816]x[800..900] must be hatched, and the two rects
    // must not double-paint it.
    expect(layout.hatches).toHaveLength(2);
    expect(overlaps(layout.hatches[0], layout.hatches[1])).toBe(false);
    const corner = { x: 800, y: 800, width: 16, height: 100 };
    expect(layout.hatches.some((h) => overlaps(h, corner))).toBe(true);
  });

  it("never double-paints when the bitmap is both narrow and overlength", () => {
    const layout = printerPreviewLayout(
      dims({ width: 600, contentLeft: 0, contentRight: 600, height: 1000, contentBottom: 900 }),
      label,
    );
    expect(layout.hatches).toHaveLength(2);
    expect(overlaps(layout.hatches[0], layout.hatches[1])).toBe(false);
    expect(area(layout.hatches[0]) + area(layout.hatches[1])).toBeGreaterThan(0);
  });

  it("handles a blank render without shifting or hatching", () => {
    const blank = dims({ contentLeft: 0, contentRight: 0, contentTop: 0, contentBottom: 0 });
    const layout = printerPreviewLayout(blank, label);
    expect(layout.crop).toEqual({ x: 0, y: 0, width: 800, height: 800 });
    expect(layout.hatches).toEqual([]);
  });
});
