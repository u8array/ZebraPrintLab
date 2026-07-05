import { describe, it, expect } from "vitest";
import { barcodeEncodeFindings, resolveForEncode, type EncodeEnv } from "./barcodePreflight";
import type { LabelObject } from "../../types/Group";
import type { LeafObject } from "../../registry";

const bar = (id: string, content = "X"): LeafObject =>
  ({ id, type: "code128", x: 0, y: 0, rotation: 0,
     props: { content, height: 50, moduleWidth: 2, printInterpretation: false, checkDigit: false, rotation: "N" } } as LabelObject as LeafObject);

const noEnv: EncodeEnv = { variables: [], active: null };

describe("barcodeEncodeFindings", () => {
  it("maps an encode error to a renderFailed finding over all given leaves", () => {
    const leaves = [bar("a"), bar("b")];
    // Inject the encoder so the mapping is tested without the DOM bwip encoder;
    // this also proves a hidden-but-exported leaf is checked (no visibility gate).
    const out = barcodeEncodeFindings(leaves, 1, 8, noEnv, (l) => (l.id === "a" ? "too much data" : null));
    expect(out).toEqual([
      { objectId: "a", kind: "renderFailed", severity: "error", detail: "too much data" },
    ]);
  });

  it("returns nothing when every leaf encodes", () => {
    expect(barcodeEncodeFindings([bar("a")], 1, 8, noEnv, () => null)).toEqual([]);
  });

  it("skips a literal-blank payload: computePreflight's emptyContent owns it, no bogus renderFailed", () => {
    // Regression: a fresh blank UPC-A reported "EAN/UPC encode failed" on top
    // of the emptyContent warning (the raw renderer has no dummy fallback).
    // Literal blank (raw content "") emits nothing here (no double emptyContent).
    const out = barcodeEncodeFindings([bar("a", "")], 1, 8, noEnv, () => "EAN/UPC encode failed");
    expect(out).toEqual([]);
  });

  it("flags a bound field whose marker resolves empty as emptyContent, not renderFailed", () => {
    // Bound to an empty default: raw content "«d»" is non-empty so
    // computePreflight sees no emptyContent; the canvas shows the placeholder,
    // so this producer surfaces the emptiness to keep panel and canvas in sync.
    const env: EncodeEnv = {
      variables: [{ id: "v", name: "d", fnNumber: 1, defaultValue: "" }],
      active: null,
    };
    const out = barcodeEncodeFindings([bar("a", "«d»")], 1, 8, env, () => "EAN/UPC encode failed");
    expect(out).toEqual([
      { objectId: "a", kind: "emptyContent", severity: "warning" },
    ]);
  });

  it("ignores non-barcode leaves: a bound TEXT resolving empty stays quiet", () => {
    // Regression (GPT finding): the resolved-empty emptyContent must not leak
    // to text; a bound text field is configured and its canvas box is honest.
    const textLeaf = {
      id: "t", type: "text", x: 0, y: 0, rotation: 0,
      props: { content: "«d»", fontHeight: 30, fontWidth: 0, rotation: "N" },
    } as LabelObject as LeafObject;
    const env: EncodeEnv = {
      variables: [{ id: "v", name: "d", fnNumber: 1, defaultValue: "" }],
      active: null,
    };
    const out = barcodeEncodeFindings([textLeaf], 1, 8, env, () => "never");
    expect(out).toEqual([]);
  });

  it("still checks a bound field whose resolved payload is non-empty", () => {
    const env: EncodeEnv = {
      variables: [{ id: "v", name: "d", fnNumber: 1, defaultValue: "0201" }],
      active: null,
    };
    const out = barcodeEncodeFindings([bar("a", "«d»")], 1, 8, env, () => "bad");
    expect(out).toEqual([
      { objectId: "a", kind: "renderFailed", severity: "error", detail: "bad" },
    ]);
  });
});

describe("resolveForEncode", () => {
  it("resolves markers like the canvas preview so the check encodes what prints", () => {
    // Raw GS1 content `1100«d»` is 4+7 chars and would flag AI 11 as too long;
    // resolved it is the valid 6-digit date payload.
    const env: EncodeEnv = {
      variables: [{ id: "v", name: "d", fnNumber: 1, defaultValue: "0201" }],
      active: null,
    };
    const resolved = resolveForEncode(bar("a", "1100«d»"), env);
    expect((resolved.props as { content: string }).content).toBe("11000201");
  });

  it("is identity-preserving for marker-free content (keeps the encode cache hot)", () => {
    const leaf = bar("a", "12345678");
    expect(resolveForEncode(leaf, noEnv)).toBe(leaf);
  });

  it("reflects the variable default in the resolved content, so the cache key (resolved string) re-encodes when a bound default changes", () => {
    const leaf = bar("a", "1100«d»");
    const short = resolveForEncode(leaf, { variables: [{ id: "v", name: "d", fnNumber: 1, defaultValue: "0201" }], active: null });
    const long = resolveForEncode(leaf, { variables: [{ id: "v", name: "d", fnNumber: 1, defaultValue: "020199" }], active: null });
    expect((short.props as { content: string }).content).toBe("11000201");
    expect((long.props as { content: string }).content).toBe("1100020199");
  });
});
