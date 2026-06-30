import { describe, expect, it } from "vitest";
import { computePreflight } from "./preflight";
import { getEntry } from "../registry";
import type { ObjectBoundsCtx } from "./objectBounds";
import type { LabelObject } from "../types/Group";
import type { LeafObject } from "../registry";
import type { LabelConfig } from "../types/LabelConfig";

const label: LabelConfig = { widthMm: 100, heightMm: 50, dpmm: 8 }; // printable 800 x 400
const ctx: ObjectBoundsCtx = { label };

function box(id: string, x: number, y: number, width: number, height: number): LeafObject {
  return {
    id,
    type: "box",
    x,
    y,
    rotation: 0,
    props: { width, height, thickness: 2, filled: false, color: "B", rounding: 0 },
  } as LabelObject as LeafObject;
}

describe("computePreflight (off-label producer)", () => {
  it("returns no findings when every leaf is inside", () => {
    expect(computePreflight([box("a", 10, 10, 100, 50)], ctx)).toEqual([]);
  });

  it("flags a clipped leaf as a warning", () => {
    expect(computePreflight([box("a", 750, 10, 100, 50)], ctx)).toEqual([
      { objectId: "a", kind: "offLabelClipped", severity: "warning" },
    ]);
  });

  it("flags a fully-outside leaf as an error", () => {
    expect(computePreflight([box("a", 900, 10, 50, 50)], ctx)).toEqual([
      { objectId: "a", kind: "offLabelOutside", severity: "error" },
    ]);
  });

  const ftBarcode = (id: string, x: number, y: number, barH: number): LeafObject =>
    ({
      id,
      type: "code128",
      x,
      y,
      rotation: 0,
      positionType: "FT",
      props: { content: "X", height: barH, moduleWidth: 2, printInterpretation: false, checkDigit: false, rotation: "N" },
    }) as LabelObject as LeafObject;
  const measuredFor = (id: string, w: number, h: number) =>
    new Map([[id, { width: w, height: h, uprightBarWDots: w, uprightBarHDots: h }]]) as ObjectBoundsCtx["measured"];

  it("classifies on the bbox for far edges; the ^FT anchor stays inside", () => {
    const bc = ftBarcode("bc", 100, 350, 100);
    // ^FT N anchors the bar BOTTOM at (100,350); measured dims put the visual
    // bbox at y 250..350, fully inside, and the emitted anchor (100,350) is on label.
    expect(computePreflight([bc], { label, measured: measuredFor("bc", 200, 100) })).toEqual([]);
  });

  it("does not flag an ^FT barcode whose bars extend above the top (valid positive anchor)", () => {
    // Regression: ^FT60,80 with 120-dot bars -> visual bbox top = 80-120 = -40,
    // but the emitted ^FT origin (60,80) is on-label, the field prints (top
    // clipped). Must NOT be the hard offLabelOutside (was, when keyed on the bbox).
    const bc = ftBarcode("bc", 60, 80, 120);
    expect(computePreflight([bc], { label, measured: measuredFor("bc", 200, 120) })).toEqual([]);
  });

  it("treats a negative-origin left crossing as outside, not clipped", () => {
    // Regression: a ^FO-50 field straddles x=0, so the bbox still reaches onto
    // the label, but the emitted origin is negative (off the printable area) ->
    // error, not the softer clipped warning.
    expect(computePreflight([box("a", -50, 10, 200, 50)], ctx)).toEqual([
      { objectId: "a", kind: "offLabelOutside", severity: "error" },
    ]);
  });

  it("flags an ^FO line that runs off the left edge as outside", () => {
    // angle 180 line from x=50, length 200 emits ^FO at x=-150 (the bbox top-left),
    // a negative origin. Keyed on obj.x (50) it would be missed.
    const line = {
      id: "ln",
      type: "line",
      x: 50,
      y: 100,
      rotation: 0,
      props: { angle: 180, length: 200, thickness: 4, color: "B" },
    } as LabelObject as LeafObject;
    expect(computePreflight([line], ctx)).toEqual([
      { objectId: "ln", kind: "offLabelOutside", severity: "error" },
    ]);
  });

  it("flags an ^FO N text with a negative emitted origin as outside", () => {
    // The user's case: ^FO-118,245 ^A0N text. The N transform leaves x at the
    // model coord, so the emitted ^FO x is -118 -> offLabelOutside.
    const txt = {
      id: "t",
      type: "text",
      x: -118,
      y: 216,
      rotation: 0,
      positionType: "FO",
      props: { content: "Text", fontHeight: 188, fontWidth: 188, rotation: "N" },
    } as LabelObject as LeafObject;
    expect(computePreflight([txt], ctx)).toEqual([
      { objectId: "t", kind: "offLabelOutside", severity: "error" },
    ]);
  });

  it("reports one finding per offending leaf and skips the inside one", () => {
    const findings = computePreflight(
      [box("in", 10, 10, 50, 50), box("clip", 760, 10, 80, 50), box("out", -200, 0, 50, 50)],
      ctx,
    );
    expect(findings.map((f) => [f.objectId, f.kind])).toEqual([
      ["clip", "offLabelClipped"],
      ["out", "offLabelOutside"],
    ]);
  });
});

describe("per-type producers (registry preflight capability)", () => {
  const textLeaf = (props: object): LeafObject =>
    ({ id: "t", type: "text", x: 0, y: 0, rotation: 0, props } as LabelObject as LeafObject);
  const bar = (moduleWidth: number): LeafObject =>
    ({
      id: "bc", type: "code128", x: 100, y: 100, rotation: 0,
      props: { content: "X", height: 50, moduleWidth, printInterpretation: false, checkDigit: false, rotation: "N" },
    } as LabelObject as LeafObject);

  it("text: a block narrower than one glyph cell flags blockTooNarrow", () => {
    const narrow = getEntry("text")!.preflight!(textLeaf({ content: "X", fontHeight: 30, fontWidth: 0, blockWidth: 2 }), { label });
    expect(narrow).toEqual([{ kind: "blockTooNarrow" }]);
  });

  it("text: a wide block and a plain (normal) field flag nothing", () => {
    const wide = getEntry("text")!.preflight!(textLeaf({ content: "X", fontHeight: 30, fontWidth: 0, blockWidth: 200 }), { label });
    const normal = getEntry("text")!.preflight!(textLeaf({ content: "X", fontHeight: 30, fontWidth: 0 }), { label });
    expect(wide).toEqual([]);
    expect(normal).toEqual([]);
  });

  it("barcode: a module below the min X-dimension flags barcodeTooSmall", () => {
    // moduleWidth 1 @ 8 dpmm = 0.125 mm < 0.25 mm.
    const small = getEntry("code128")!.preflight!(bar(1), { label });
    expect(small).toEqual([{ kind: "barcodeTooSmall", detail: "0.13 mm (min 0.25 mm)" }]);
  });

  it("barcode: a module at/above the min X-dimension flags nothing", () => {
    // moduleWidth 2 @ 8 dpmm = 0.25 mm.
    expect(getEntry("code128")!.preflight!(bar(2), { label })).toEqual([]);
  });

  it("computePreflight stamps objectId + severity from a producer finding", () => {
    expect(computePreflight([bar(1)], ctx)).toContainEqual({
      objectId: "bc", kind: "barcodeTooSmall", severity: "warning", detail: "0.13 mm (min 0.25 mm)",
    });
  });

  it("2D: a QR magnification below the min cell size flags barcodeTooSmall", () => {
    const qr = (magnification: number): LeafObject =>
      ({ id: "q", type: "qrcode", x: 0, y: 0, rotation: 0,
         props: { content: "x", magnification, errorCorrection: "Q", model: 2, rotation: "N" } } as LabelObject as LeafObject);
    // magnification 1 @ 8 dpmm = 0.125 mm < 0.25; magnification 2 = 0.25 mm (ok).
    expect(getEntry("qrcode")!.preflight!(qr(1), { label })).toEqual([
      { kind: "barcodeTooSmall", detail: "0.13 mm (min 0.25 mm)" },
    ]);
    expect(getEntry("qrcode")!.preflight!(qr(2), { label })).toEqual([]);
  });

  it("text: ^FB content wrapping past the line cap flags textOverset", () => {
    const fb = textLeaf({ content: "AAA BBB CCC", fontHeight: 30, fontWidth: 0, blockWidth: 40, blockLines: 1 });
    expect(getEntry("text")!.preflight!(fb, { label })).toEqual([{ kind: "textOverset" }]);
  });

  it("text: ^TB content taller than the block height flags textOverset", () => {
    const tb = textLeaf({ content: "AAA", fontHeight: 30, fontWidth: 0, blockWidth: 200, blockHeight: 10, textMode: "tb" });
    expect(getEntry("text")!.preflight!(tb, { label })).toEqual([{ kind: "textOverset" }]);
  });

  it("text: a block with room to spare flags nothing", () => {
    const ok = textLeaf({ content: "AAA", fontHeight: 30, fontWidth: 0, blockWidth: 400, blockLines: 5 });
    expect(getEntry("text")!.preflight!(ok, { label })).toEqual([]);
  });

  it("image: no resolvable bytes flags imageMissing; rawGf resolves", () => {
    const img = (props: object): LeafObject =>
      ({ id: "i", type: "image", x: 0, y: 0, rotation: 0, props } as LabelObject as LeafObject);
    expect(getEntry("image")!.preflight!(img({ imageId: "nope", widthDots: 200, threshold: 128 }), { label })).toEqual([
      { kind: "imageMissing" },
    ]);
    expect(getEntry("image")!.preflight!(img({ imageId: "nope", widthDots: 200, threshold: 128, rawGf: "^GFA,1,1,1,00" }), { label })).toEqual([]);
  });
});
