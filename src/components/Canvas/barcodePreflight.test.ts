import { describe, it, expect } from "vitest";
import { barcodeEncodeFindings } from "./barcodePreflight";
import type { LabelObject } from "../../types/Group";
import type { LeafObject } from "../../registry";

const bar = (id: string): LeafObject =>
  ({ id, type: "code128", x: 0, y: 0, rotation: 0,
     props: { content: "X", height: 50, moduleWidth: 2, printInterpretation: false, checkDigit: false, rotation: "N" } } as LabelObject as LeafObject);

describe("barcodeEncodeFindings", () => {
  it("maps an encode error to a renderFailed finding over all given leaves", () => {
    const leaves = [bar("a"), bar("b")];
    // Inject the encoder so the mapping is tested without the DOM bwip encoder;
    // this also proves a hidden-but-exported leaf is checked (no visibility gate).
    const out = barcodeEncodeFindings(leaves, 1, 8, (l) => (l.id === "a" ? "too much data" : null));
    expect(out).toEqual([
      { objectId: "a", kind: "renderFailed", severity: "error", detail: "too much data" },
    ]);
  });

  it("returns nothing when every leaf encodes", () => {
    expect(barcodeEncodeFindings([bar("a")], 1, 8, () => null)).toEqual([]);
  });
});
