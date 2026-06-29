import { describe, expect, it } from "vitest";
import { computePreflight } from "./preflight";
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
