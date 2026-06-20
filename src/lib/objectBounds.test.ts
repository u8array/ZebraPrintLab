import { describe, expect, it } from "vitest";
import { objectBoundsDots, selectionUnionDots, type ObjectBoundsCtx } from "./objectBounds";
import type { LabelConfig } from "../types/LabelConfig";
import type { LabelObject } from "../types/Group";
import type { LeafObject } from "../registry";

const label: LabelConfig = { widthMm: 100, heightMm: 50, dpmm: 8 };
const ctx = (measured?: ObjectBoundsCtx["measured"]): ObjectBoundsCtx => ({ label, measured });

function leaf<T extends LeafObject["type"]>(
  type: T,
  x: number,
  y: number,
  props: Extract<LeafObject, { type: T }>["props"],
  extra: Partial<LabelObject> = {},
): LeafObject {
  return { id: `${type}-${x}-${y}`, type, x, y, rotation: 0, props, ...extra } as LeafObject;
}

describe("objectBoundsDots", () => {
  it("box: raw prop footprint at origin", () => {
    const box = leaf("box", 10, 20, { width: 200, height: 100, thickness: 3, filled: false, color: "B", rounding: 0 });
    expect(objectBoundsDots(box, ctx())).toEqual({ x: 10, y: 20, width: 200, height: 100 });
  });

  it("ellipse: raw prop footprint at origin", () => {
    const e = leaf("ellipse", 5, 5, { width: 150, height: 80, thickness: 3, filled: false, color: "B" });
    expect(objectBoundsDots(e, ctx())).toEqual({ x: 5, y: 5, width: 150, height: 80 });
  });

  it("image: heightDots when present, else square from width", () => {
    const withH = leaf("image", 0, 0, { imageId: "a", widthDots: 120, heightDots: 60, threshold: 128 });
    expect(objectBoundsDots(withH, ctx())).toEqual({ x: 0, y: 0, width: 120, height: 60 });
    const noH = leaf("image", 4, 8, { imageId: "a", widthDots: 90, threshold: 128 });
    expect(objectBoundsDots(noH, ctx())).toEqual({ x: 4, y: 8, width: 90, height: 90 });
  });

  it("image: measured footprint (cached aspect) overrides the heightDots fallback", () => {
    const cached = leaf("image", 1, 1, { imageId: "a", widthDots: 120, threshold: 128 });
    const measured = new Map([[cached.id, { width: 120, height: 40 }]]);
    expect(objectBoundsDots(cached, ctx(measured))).toEqual({ x: 1, y: 1, width: 120, height: 40 });
  });

  it("line: horizontal bbox uses thickness on thin axis", () => {
    const ln = leaf("line", 10, 50, { angle: 0, length: 200, thickness: 4, color: "B" });
    expect(objectBoundsDots(ln, ctx())).toEqual({ x: 10, y: 50, width: 200, height: 4 });
  });

  it("line: 180deg extends left of the origin", () => {
    const ln = leaf("line", 300, 50, { angle: 180, length: 200, thickness: 4, color: "B" });
    const b = objectBoundsDots(ln, ctx());
    expect(b.x).toBeCloseTo(100, 6);
    expect(b.width).toBeCloseTo(200, 6);
    expect(b.height).toBe(4);
  });

  it("line: diagonal optical bbox includes the ^GD horizontal shear", () => {
    // 3-4-5: angle ~36.87deg, length 100 -> dx 80, dy 60. ^GD shears the band
    // horizontally by thickness, so the optical width is dx + t = 82.
    const ln = leaf("line", 0, 0, { angle: Math.atan2(60, 80) * 180 / Math.PI, length: 100, thickness: 2, color: "B" });
    const b = objectBoundsDots(ln, ctx());
    expect(b.x).toBeCloseTo(0, 6);
    expect(b.y).toBeCloseTo(0, 6);
    expect(b.width).toBeCloseTo(82, 6);
    expect(b.height).toBeCloseTo(60, 6);
  });

  it("symbol: bbox stays w x h regardless of rotation", () => {
    const s = leaf("symbol", 7, 9, { symbol: "A", width: 40, height: 30, rotation: "R" });
    expect(objectBoundsDots(s, ctx())).toEqual({ x: 7, y: 9, width: 40, height: 30 });
  });

  it("text ^FB block (N): blockBoundsDots footprint shifted to model space", () => {
    // lineStep = 40 + 10 = 50; linesExtent = (3-1)*50 + 40 = 140.
    const t = leaf("text", 50, 30, {
      content: "x", fontHeight: 40, fontWidth: 0, rotation: "N",
      blockWidth: 160, blockLines: 3, blockLineSpacing: 10, blockJustify: "L",
    });
    expect(objectBoundsDots(t, ctx())).toEqual({ x: 50, y: 30, width: 160, height: 140 });
  });

  it("text ^FB block (R): axes swap and negative x shift fold into model space", () => {
    // R: x = -linesExtent (-140), y = 0, width = linesExtent (140), height = blockWidth (160).
    const t = leaf("text", 50, 30, {
      content: "x", fontHeight: 40, fontWidth: 0, rotation: "R",
      blockWidth: 160, blockLines: 3, blockLineSpacing: 10, blockJustify: "L",
    });
    expect(objectBoundsDots(t, ctx())).toEqual({ x: -90, y: 30, width: 140, height: 160 });
  });

  it("single-line text: measured cache supplies the rotated footprint", () => {
    const t = leaf("text", 12, 24, { content: "Hello", fontHeight: 30, fontWidth: 0, rotation: "N" });
    const measured = new Map([[t.id, { width: 77, height: 30 }]]);
    expect(objectBoundsDots(t, ctx(measured))).toEqual({ x: 12, y: 24, width: 77, height: 30 });
  });

  it("single-line text: measured footprint is used verbatim (producer already rotated it)", () => {
    const t = leaf("text", 12, 24, { content: "Hello", fontHeight: 30, fontWidth: 0, rotation: "R" });
    const measured = new Map([[t.id, { width: 30, height: 77 }]]); // already rotated
    expect(objectBoundsDots(t, ctx(measured))).toEqual({ x: 12, y: 24, width: 30, height: 77 });
  });

  it("single-line text: fallback estimate swaps axes for R", () => {
    const t = leaf("text", 0, 0, { content: "AB", fontHeight: 30, fontWidth: 0, rotation: "R" });
    const b = objectBoundsDots(t, ctx());
    expect(b.width).toBe(30);
    expect(b.height).toBeCloseTo(33.3, 6);
  });

  it("single-line text: fallback estimate from Font-0 advance when unmeasured", () => {
    // A advance 0.555, B 0.555 -> (0.555 + 0.555) * 30 = 33.3.
    const t = leaf("text", 0, 0, { content: "AB", fontHeight: 30, fontWidth: 0, rotation: "N" });
    const b = objectBoundsDots(t, ctx());
    expect(b.width).toBeCloseTo(33.3, 6);
    expect(b.height).toBe(30);
  });

  it("serial: measured cache then fallback", () => {
    const s = leaf("serial", 3, 3, { content: "001", increment: 1, fontHeight: 30, fontWidth: 0, rotation: "N", zplMode: "SN" });
    const measured = new Map([[s.id, { width: 44, height: 30 }]]);
    expect(objectBoundsDots(s, ctx(measured))).toEqual({ x: 3, y: 3, width: 44, height: 30 });
    // No measurement: 0/0/1 advance 0.48 each -> 1.44 * 30 = 43.2.
    const b = objectBoundsDots(s, ctx());
    expect(b.width).toBeCloseTo(43.2, 6);
    expect(b.height).toBe(30);
  });

  it("barcode (FO): measured footprint at the origin", () => {
    const bc = leaf("code128", 20, 40, { content: "123", moduleWidth: 2, height: 80, printInterpretation: true } as never);
    const measured = new Map([[bc.id, { width: 150, height: 80 }]]);
    expect(objectBoundsDots(bc, ctx(measured))).toEqual({ x: 20, y: 40, width: 150, height: 80 });
  });

  it("barcode (FT 1D): top sits one bar-height above the baseline", () => {
    const bc = leaf(
      "code128", 20, 100,
      { content: "123", moduleWidth: 2, height: 80, printInterpretation: true } as never,
      { positionType: "FT" },
    );
    const measured = new Map([[bc.id, { width: 150, height: 80 }]]);
    // FT baseline at y=100; visual top = 100 - 80 = 20.
    expect(objectBoundsDots(bc, ctx(measured))).toEqual({ x: 20, y: 20, width: 150, height: 80 });
  });

  it("barcode (FT 1D with HRI zone): top shifts by BAR height, not the full footprint", () => {
    // ean13: bar height 80, measured footprint 93 (13-dot HRI text zone below bars).
    const bc = leaf(
      "ean13", 20, 100,
      { content: "4006381333931", moduleWidth: 2, height: 80, printInterpretation: true } as never,
      { positionType: "FT" },
    );
    const measured = new Map([[bc.id, { width: 150, height: 93 }]]);
    // top = baseline 100 - barHeight 80 = 20 (NOT 100 - 93); bbox keeps full height 93.
    expect(objectBoundsDots(bc, ctx(measured))).toEqual({ x: 20, y: 20, width: 150, height: 93 });
  });

  it("barcode (FT 1D rotated R): FT shift uses the published bar extent, not props.height", () => {
    // R rotation: the rendered bar extent (barHeightDots) is the rotated height,
    // not the upright props.height; the FT anchor must use it.
    const bc = leaf(
      "code128", 20, 100,
      { content: "123", moduleWidth: 2, height: 80, rotation: "R", printInterpretation: true } as never,
      { positionType: "FT" },
    );
    const measured = new Map([[bc.id, { width: 40, height: 200, barHeightDots: 200 }]]);
    // yShift = barHeightDots 200 -> top = 100 - 200 = -100 (props.height 80 would be wrong).
    expect(objectBoundsDots(bc, ctx(measured))).toEqual({ x: 20, y: -100, width: 40, height: 200 });
  });

  it("barcode (FO with above-HRI zone): top shifts up by the text-zone offset", () => {
    // logmars: text zone above the bars (barTopDots), bbox top-left sits above FO.
    const bc = leaf(
      "logmars", 20, 40,
      { content: "ABC", moduleWidth: 2, height: 80, printInterpretation: true } as never,
    );
    const measured = new Map([[bc.id, { width: 150, height: 95, barTopDots: 15 }]]);
    expect(objectBoundsDots(bc, ctx(measured))).toEqual({ x: 20, y: 25, width: 150, height: 95 });
  });

  it("barcode (FO rotated, text zone left): top-left shifts left by the text-zone offset", () => {
    // Rotated EAN/UPC: HRI text zone sits left of the bars (barLeftDots).
    const bc = leaf(
      "ean13", 20, 40,
      { content: "4006381333931", moduleWidth: 2, height: 80, rotation: "R", printInterpretation: true } as never,
    );
    const measured = new Map([[bc.id, { width: 95, height: 150, barLeftDots: 15 }]]);
    expect(objectBoundsDots(bc, ctx(measured))).toEqual({ x: 5, y: 40, width: 95, height: 150 });
  });

  it("barcode (FT with text-zone offsets): subtracts bar extent and both zone offsets", () => {
    const bc = leaf(
      "ean13", 20, 100,
      { content: "4006381333931", moduleWidth: 2, height: 80, rotation: "I", printInterpretation: true } as never,
      { positionType: "FT" },
    );
    const measured = new Map([[bc.id, { width: 150, height: 95, barHeightDots: 80, barLeftDots: 10, barTopDots: 15 }]]);
    // x: 20 - 10 = 10; y: 100 - 80 - 15 = 5.
    expect(objectBoundsDots(bc, ctx(measured))).toEqual({ x: 10, y: 5, width: 150, height: 95 });
  });

  it("barcode: registry fallback when unmeasured", () => {
    const bc = leaf("code128", 0, 0, { content: "123", moduleWidth: 2, height: 80, printInterpretation: true } as never);
    const b = objectBoundsDots(bc, ctx());
    // code128 defaultSize is in dots; non-zero footprint proves the fallback path.
    expect(b.width).toBeGreaterThan(0);
    expect(b.height).toBeGreaterThan(0);
  });

  it("qrcode (FO): +10 dot firmware Y artifact", () => {
    const qr = leaf("qrcode", 10, 10, { content: "x", magnification: 5, errorCorrection: "M" } as never);
    const measured = new Map([[qr.id, { width: 120, height: 120 }]]);
    expect(objectBoundsDots(qr, ctx(measured))).toEqual({ x: 10, y: 20, width: 120, height: 120 });
  });
});

describe("groups and selection union", () => {
  const box = leaf("box", 0, 0, { width: 100, height: 50, thickness: 3, filled: false, color: "B", rounding: 0 });
  const ellipse = leaf("ellipse", 200, 100, { width: 80, height: 80, thickness: 3, filled: false, color: "B" });
  const group: LabelObject = {
    id: "g1", type: "group", x: 0, y: 0, rotation: 0,
    children: [box, ellipse],
  } as LabelObject;

  it("group: union of all leaf bboxes", () => {
    // box spans (0,0)-(100,50); ellipse (200,100)-(280,180).
    expect(objectBoundsDots(group, ctx())).toEqual({ x: 0, y: 0, width: 280, height: 180 });
  });

  it("selectionUnionDots: mixed leaf + group selection", () => {
    const lone = leaf("box", 300, 300, { width: 20, height: 20, thickness: 3, filled: false, color: "B", rounding: 0 });
    const objects: LabelObject[] = [group, lone];
    const u = selectionUnionDots(objects, ["g1", lone.id], ctx());
    expect(u).toEqual({ x: 0, y: 0, width: 320, height: 320 });
  });

  it("selectionUnionDots: a group id resolves to one bbox", () => {
    const objects: LabelObject[] = [group];
    expect(selectionUnionDots(objects, ["g1"], ctx())).toEqual({ x: 0, y: 0, width: 280, height: 180 });
  });

  it("selectionUnionDots: null for empty or unknown ids", () => {
    expect(selectionUnionDots([group], [], ctx())).toBeNull();
    expect(selectionUnionDots([group], ["missing"], ctx())).toBeNull();
  });
});
