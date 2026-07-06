import { describe, expect, it } from "vitest";
import { computePreflight, markerValueFindings, suppressPristineEmpty, type PreflightFinding } from "./preflight";
import { getEntry } from "../registry";
import type { ObjectBoundsCtx } from "./objectBounds";
import type { LabelObject } from "../types/Group";
import type { LeafObject } from "../registry";
import type { LabelConfig } from "../types/LabelConfig";

const label: LabelConfig = { widthMm: 100, heightMm: 50, dpmm: 8 }; // printable 800 x 400
const ctx: ObjectBoundsCtx = { label };
const pctx = { label, unit: "mm" } as const;

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
    expect(computePreflight([box("a", 10, 10, 100, 50)], ctx, "mm")).toEqual([]);
  });

  it("flags a clipped leaf as a warning", () => {
    expect(computePreflight([box("a", 750, 10, 100, 50)], ctx, "mm")).toEqual([
      { objectId: "a", kind: "offLabelClipped", severity: "warning" },
    ]);
  });

  it("flags a fully-outside leaf as an error", () => {
    expect(computePreflight([box("a", 900, 10, 50, 50)], ctx, "mm")).toEqual([
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
    expect(computePreflight([bc], { label, measured: measuredFor("bc", 200, 100) }, "mm")).toEqual([]);
  });

  it("does not flag an ^FT barcode whose bars extend above the top (valid positive anchor)", () => {
    // Regression: ^FT60,80 with 120-dot bars -> visual bbox top = 80-120 = -40,
    // but the emitted ^FT origin (60,80) is on-label, the field prints (top
    // clipped). Must NOT be the hard offLabelOutside (was, when keyed on the bbox).
    const bc = ftBarcode("bc", 60, 80, 120);
    expect(computePreflight([bc], { label, measured: measuredFor("bc", 200, 120) }, "mm")).toEqual([]);
  });

  it("treats a negative-origin left crossing as outside, not clipped", () => {
    // Regression: a ^FO-50 field straddles x=0, so the bbox still reaches onto
    // the label, but the emitted origin is negative (off the printable area) ->
    // error, not the softer clipped warning.
    expect(computePreflight([box("a", -50, 10, 200, 50)], ctx, "mm")).toEqual([
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
    expect(computePreflight([line], ctx, "mm")).toEqual([
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
    expect(computePreflight([txt], ctx, "mm")).toEqual([
      { objectId: "t", kind: "offLabelOutside", severity: "error" },
    ]);
  });

  it("reports one finding per offending leaf and skips the inside one", () => {
    const findings = computePreflight(
      [box("in", 10, 10, 50, 50), box("clip", 760, 10, 80, 50), box("out", -200, 0, 50, 50)],
      ctx,
      "mm",
    );
    expect(findings.map((f) => [f.objectId, f.kind])).toEqual([
      ["clip", "offLabelClipped"],
      ["out", "offLabelOutside"],
    ]);
  });
});

describe("emptyContent producer", () => {
  const text = (id: string, content: string, extraProps: object = {}): LeafObject =>
    ({
      id,
      type: "text",
      x: 10,
      y: 10,
      rotation: 0,
      props: { content, fontHeight: 30, fontWidth: 0, rotation: "N", ...extraProps },
    }) as LabelObject as LeafObject;

  it("flags a blank text field as a warning, and only that", () => {
    expect(computePreflight([text("t", "")], ctx, "mm")).toEqual([
      { objectId: "t", kind: "emptyContent", severity: "warning" },
    ]);
  });

  it("flags whitespace-only content (prints a gap all the same)", () => {
    expect(computePreflight([text("t", "  ")], ctx, "mm")).toEqual([
      { objectId: "t", kind: "emptyContent", severity: "warning" },
    ]);
  });

  it("flags a blank barcode field", () => {
    const bc = {
      id: "bc",
      type: "code128",
      x: 10,
      y: 10,
      rotation: 0,
      props: { content: "", height: 80, moduleWidth: 2, printInterpretation: false, checkDigit: false, rotation: "N" },
    } as LabelObject as LeafObject;
    expect(computePreflight([bc], ctx, "mm")).toEqual([
      { objectId: "bc", kind: "emptyContent", severity: "warning" },
    ]);
  });

  it("flags a serial field whose seed is blank (prints nothing to increment)", () => {
    const serial = text("s", "", { serial: { increment: 1, zplMode: "SN" } });
    expect(computePreflight([serial], ctx, "mm")).toEqual([
      { objectId: "s", kind: "emptyContent", severity: "warning" },
    ]);
  });

  it("does not fire on marker content: bound fields are configured even when a row resolves blank", () => {
    expect(computePreflight([text("t", "«batch»")], ctx, "mm")).toEqual([]);
  });

  it("reports hidden-char-only content as suspiciousChars, not emptyContent", () => {
    // NBSP-only content trims to empty but carries invisible ink: the specific
    // 'NBSP x2' diagnostic must win over the generic 'field is empty'.
    expect(computePreflight([text("t", "  ")], ctx, "mm")).toEqual([
      { objectId: "t", kind: "suspiciousChars", severity: "warning", detail: "NBSP x2" },
    ]);
  });

  it("does not fire on types without a content field", () => {
    expect(computePreflight([box("b", 10, 10, 50, 50)], ctx, "mm")).toEqual([]);
  });
});

describe("suppressPristineEmpty", () => {
  const empty = (id: string): PreflightFinding => ({ objectId: id, kind: "emptyContent", severity: "warning" });
  const outside = (id: string): PreflightFinding => ({ objectId: id, kind: "offLabelOutside", severity: "error" });

  it("drops only emptyContent findings of pristine ids, everything else passes", () => {
    const findings = [empty("a"), outside("a"), empty("b")];
    expect(suppressPristineEmpty(findings, ["a"])).toEqual([outside("a"), empty("b")]);
  });

  it("is the identity when nothing is pristine", () => {
    const findings = [empty("a")];
    expect(suppressPristineEmpty(findings, [])).toBe(findings);
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
    const narrow = getEntry("text")!.preflight!(textLeaf({ content: "X", fontHeight: 30, fontWidth: 0, blockWidth: 2 }), pctx);
    expect(narrow).toEqual([{ kind: "blockTooNarrow" }]);
  });

  it("text: a wide block and a plain (normal) field flag nothing", () => {
    const wide = getEntry("text")!.preflight!(textLeaf({ content: "X", fontHeight: 30, fontWidth: 0, blockWidth: 200 }), pctx);
    const normal = getEntry("text")!.preflight!(textLeaf({ content: "X", fontHeight: 30, fontWidth: 0 }), pctx);
    expect(wide).toEqual([]);
    expect(normal).toEqual([]);
  });

  it("barcode: a module below the min X-dimension flags barcodeTooSmall", () => {
    // moduleWidth 1 @ 8 dpmm = 0.125 mm < 0.25 mm.
    const small = getEntry("code128")!.preflight!(bar(1), pctx);
    expect(small).toEqual([{ kind: "barcodeTooSmall", detail: "0.13 mm (min 0.25 mm)" }]);
  });

  it("barcode: a module at/above the min X-dimension flags nothing", () => {
    // moduleWidth 2 @ 8 dpmm = 0.25 mm.
    expect(getEntry("code128")!.preflight!(bar(2), pctx)).toEqual([]);
  });

  it("computePreflight stamps objectId + severity from a producer finding", () => {
    expect(computePreflight([bar(1)], ctx, "mm")).toContainEqual({
      objectId: "bc", kind: "barcodeTooSmall", severity: "warning", detail: "0.13 mm (min 0.25 mm)",
    });
  });

  it("2D: a QR magnification below the min cell size flags barcodeTooSmall", () => {
    const qr = (magnification: number): LeafObject =>
      ({ id: "q", type: "qrcode", x: 0, y: 0, rotation: 0,
         props: { content: "x", magnification, errorCorrection: "Q", model: 2, rotation: "N" } } as LabelObject as LeafObject);
    // magnification 1 @ 8 dpmm = 0.125 mm < 0.25; magnification 2 = 0.25 mm (ok).
    expect(getEntry("qrcode")!.preflight!(qr(1), pctx)).toEqual([
      { kind: "barcodeTooSmall", detail: "0.13 mm (min 0.25 mm)" },
    ]);
    expect(getEntry("qrcode")!.preflight!(qr(2), pctx)).toEqual([]);
  });

  it("renders the module detail in the active display unit", () => {
    expect(getEntry("code128")!.preflight!(bar(1), { label, unit: "in" })).toEqual([
      { kind: "barcodeTooSmall", detail: "0.005 in (min 0.010 in)" },
    ]);
    expect(getEntry("code128")!.preflight!(bar(1), { label, unit: "cm" })).toEqual([
      { kind: "barcodeTooSmall", detail: "0.013 cm (min 0.025 cm)" },
    ]);
  });

  it("text: ^FB content wrapping past the line cap flags textOverset", () => {
    const fb = textLeaf({ content: "AAA BBB CCC", fontHeight: 30, fontWidth: 0, blockWidth: 40, blockLines: 1 });
    expect(getEntry("text")!.preflight!(fb, pctx)).toEqual([{ kind: "textOverset" }]);
  });

  it("text: ^TB content taller than the block height flags textOverset", () => {
    const tb = textLeaf({ content: "AAA", fontHeight: 30, fontWidth: 0, blockWidth: 200, blockHeight: 10, textMode: "tb" });
    expect(getEntry("text")!.preflight!(tb, pctx)).toEqual([{ kind: "textOverset" }]);
  });

  it("text: a block with room to spare flags nothing", () => {
    const ok = textLeaf({ content: "AAA", fontHeight: 30, fontWidth: 0, blockWidth: 400, blockLines: 5 });
    expect(getEntry("text")!.preflight!(ok, pctx)).toEqual([]);
  });

  it("image: no resolvable bytes flags imageMissing; rawGf resolves", () => {
    const img = (props: object): LeafObject =>
      ({ id: "i", type: "image", x: 0, y: 0, rotation: 0, props } as LabelObject as LeafObject);
    expect(getEntry("image")!.preflight!(img({ imageId: "nope", widthDots: 200, threshold: 128 }), pctx)).toEqual([
      { kind: "imageMissing" },
    ]);
    expect(getEntry("image")!.preflight!(img({ imageId: "nope", widthDots: 200, threshold: 128, rawGf: "^GFA,1,1,1,00" }), pctx)).toEqual([]);
  });
});

describe("computePreflight (suspicious-chars producer)", () => {
  const NBSP = String.fromCharCode(0xa0);
  const dm = (id: string, content: string): LeafObject =>
    ({
      id,
      type: "datamatrix",
      x: 10,
      y: 10,
      rotation: 0,
      props: { content, dimension: 5, quality: 200, rotation: "N", gs1: false },
    }) as LabelObject as LeafObject;

  it("flags NBSP padding smuggled into barcode content", () => {
    const findings = computePreflight([dm("a", "0104" + NBSP + NBSP)], ctx, "mm");
    expect(findings).toContainEqual({
      objectId: "a",
      kind: "suspiciousChars",
      severity: "warning",
      detail: "NBSP x2",
    });
  });

  it("does not flag clean content", () => {
    const findings = computePreflight([dm("a", "01042601194549961726013110")], ctx, "mm");
    expect(findings.some((f) => f.kind === "suspiciousChars")).toBe(false);
  });

  it("is cross-cutting: also flags a plain text leaf, not just barcodes", () => {
    const txt = {
      id: "t",
      type: "text",
      x: 10,
      y: 10,
      rotation: 0,
      props: { content: "Hi" + NBSP, fontHeight: 30, fontWidth: 0, rotation: "N" },
    } as LabelObject as LeafObject;
    const findings = computePreflight([txt], ctx, "mm");
    expect(findings).toContainEqual({
      objectId: "t",
      kind: "suspiciousChars",
      severity: "warning",
      detail: "NBSP x1",
    });
  });

  // GS1 content chains AIs with a structural GS separator (0x1D); it's valid
  // data, not smuggled, so it must not trip the suspicious-chars badge.
  const GS = String.fromCharCode(0x1d);
  const gs1Dm = (content: string): LeafObject =>
    ({
      id: "g",
      type: "datamatrix",
      x: 10,
      y: 10,
      rotation: 0,
      props: { content, dimension: 5, quality: 200, rotation: "N", gs1: true },
    }) as LabelObject as LeafObject;

  it("does not flag the GS separator in GS1 content", () => {
    const findings = computePreflight([gs1Dm("10ABC" + GS + "21XYZ")], ctx, "mm");
    expect(findings.some((f) => f.kind === "suspiciousChars")).toBe(false);
  });

  it("still flags a control char in a non-GS1 field", () => {
    const findings = computePreflight([dm("a", "10ABC" + GS + "21XYZ")], ctx, "mm");
    expect(findings.some((f) => f.kind === "suspiciousChars")).toBe(true);
  });
});

describe("markerValueFindings (typed-content marker values)", () => {
  const qr = (id: string, content: string, extra: object = {}): LeafObject =>
    ({ id, type: "qrcode", x: 0, y: 0, rotation: 0,
       props: { content, magnification: 3, errorCorrection: "M", model: 2, rotation: "N", ...extra } } as LabelObject as LeafObject);
  const vars = [{ id: "s", name: "ssid", fnNumber: 1, defaultValue: "A;B" }];
  const deps = { variables: vars, csvDataset: null, csvMapping: null };

  it("flags a WiFi payload whose marker default carries a structural char", () => {
    const out = markerValueFindings([qr("a", "WIFI:T:WPA;S:«ssid»;;")], deps);
    expect(out).toEqual([
      { objectId: "a", kind: "markerValueUnsafe", severity: "warning", detail: "ssid: ;" },
    ]);
  });

  it("flags a dirty CSV cell after a re-import even when the default is clean", () => {
    const clean = [{ id: "s", name: "ssid", fnNumber: 1, defaultValue: "SafeNet" }];
    const csvDataset = { headers: ["net"], rows: [["A;B"]] };
    const csvMapping = { bindings: { s: "net" }, headerSnapshot: ["net"] };
    const out = markerValueFindings([qr("a", "WIFI:T:WPA;S:«ssid»;;")], { variables: clean, csvDataset, csvMapping });
    expect(out).toHaveLength(1);
  });

  it("stays quiet for text payloads and marker-free content", () => {
    expect(markerValueFindings([qr("a", "hello «ssid»")], deps)).toEqual([]);
    expect(markerValueFindings([qr("b", "WIFI:T:WPA;S:literal;;")], deps)).toEqual([]);
  });

  it("flags a row whose empty cell blanks a required field (incomplete payload)", () => {
    const clean = [{ id: "s", name: "ssid", fnNumber: 1, defaultValue: "SafeNet" }];
    const csvDataset = { headers: ["net"], rows: [["ok"], [""]] };
    const csvMapping = { bindings: { s: "net" }, headerSnapshot: ["net"] };
    const out = markerValueFindings([qr("a", "WIFI:T:WPA;S:«ssid»;;")], { variables: clean, csvDataset, csvMapping });
    expect(out).toEqual([
      { objectId: "a", kind: "markerValueUnsafe", severity: "warning", detail: "incomplete rows: 2" },
    ]);
  });

  it("flags an empty default when no CSV is bound (defaults print)", () => {
    const empty = [{ id: "s", name: "ssid", fnNumber: 1, defaultValue: "" }];
    const out = markerValueFindings([qr("a", "WIFI:T:WPA;S:«ssid»;;")], { variables: empty, csvDataset: null, csvMapping: null });
    expect(out).toEqual([
      { objectId: "a", kind: "markerValueUnsafe", severity: "warning", detail: "incomplete with defaults" },
    ]);
  });

  const bc = (id: string, content: string): LeafObject =>
    ({ id, type: "code128", x: 0, y: 0, rotation: 0,
       props: { content, gs1: true, height: 100, moduleWidth: 2, printInterpretation: false, checkDigit: false, rotation: "N" } } as LabelObject as LeafObject);
  const gtin14 = "09501101530003";

  it("flags a GS1 template whose variable widths no longer parse (raw-fallback emit)", () => {
    const fits = [{ id: "g", name: "gtin", fnNumber: 1, defaultValue: gtin14 }];
    const short = [{ id: "g", name: "gtin", fnNumber: 1, defaultValue: "123" }];
    expect(markerValueFindings([bc("a", "01«gtin»")], { variables: fits, csvDataset: null, csvMapping: null })).toEqual([]);
    expect(markerValueFindings([bc("b", "01«gtin»")], { variables: short, csvDataset: null, csvMapping: null })).toEqual([
      { objectId: "b", kind: "gs1ValueInvalid", severity: "warning", detail: "variable widths no longer fit the AI structure" },
    ]);
    // Single-bind lone marker is the encode badge's job, not this check's.
    expect(markerValueFindings([bc("c", "«gtin»")], { variables: short, csvDataset: null, csvMapping: null })).toEqual([]);
  });

  it("flags CSV rows whose substitution breaks an AI (length or charset), by row number", () => {
    const gvars = [{ id: "g", name: "gtin", fnNumber: 1, defaultValue: gtin14 }];
    // Variable-length AI (10): row 2 empty (real error per-row), row 3 fine.
    const lvars = [{ id: "l", name: "lot", fnNumber: 1, defaultValue: "AB12" }];
    const csvDataset = { headers: ["lot"], rows: [["OK1"], [""], ["OK2"]] };
    const csvMapping = { bindings: { l: "lot" }, headerSnapshot: ["lot"] };
    const out = markerValueFindings([bc("a", "10«lot»")], { variables: lvars, csvDataset, csvMapping });
    expect(out).toEqual([
      { objectId: "a", kind: "gs1ValueInvalid", severity: "warning", detail: "row 2: (10) empty" },
    ]);
    // Fixed AI: a row with wrong width flags exactLength for that row.
    const gDataset = { headers: ["ean"], rows: [[gtin14], ["1234"]] };
    const gMapping = { bindings: { g: "ean" }, headerSnapshot: ["ean"] };
    const out2 = markerValueFindings([bc("b", "01«gtin»")], { variables: gvars, csvDataset: gDataset, csvMapping: gMapping });
    expect(out2).toEqual([
      { objectId: "b", kind: "gs1ValueInvalid", severity: "warning", detail: "row 2: (01) exactLength" },
    ]);
  });

  it("validates every row of a SINGLE-BIND GS1 field (encode badge covers only the active row)", () => {
    const gvars = [{ id: "g", name: "gtin", fnNumber: 1, defaultValue: "0109501101530003" }];
    const csvDataset = { headers: ["pay"], rows: [["0109501101530003"], ["01123"]] };
    const csvMapping = { bindings: { g: "pay" }, headerSnapshot: ["pay"] };
    const out = markerValueFindings([bc("a", "«gtin»")], { variables: gvars, csvDataset, csvMapping });
    expect(out).toEqual([
      { objectId: "a", kind: "gs1ValueInvalid", severity: "warning", detail: "row 2: does not parse as GS1" },
    ]);
    const clean = markerValueFindings([bc("b", "«gtin»")], { variables: gvars, csvDataset: null, csvMapping: null });
    expect(clean).toEqual([]);
  });

  it("flags block-control chars in template values of ^TB/^FB text fields", () => {
    const txt = (id: string, content: string, extra: object): LeafObject =>
      ({ id, type: "text", x: 0, y: 0, rotation: 0,
         props: { content, fontHeight: 30, fontWidth: 0, rotation: "N", ...extra } } as LabelObject as LeafObject);
    const tbDirty = [{ id: "v", name: "note", fnNumber: 1, defaultValue: "a<b" }];
    const fbDirty = [{ id: "v", name: "note", fnNumber: 1, defaultValue: "a\\b" }];
    const deps0 = (variables: typeof tbDirty) => ({ variables, csvDataset: null, csvMapping: null });
    expect(markerValueFindings([txt("a", "x«note»y", { textMode: "tb", blockWidth: 200 })], deps0(tbDirty))).toEqual([
      { objectId: "a", kind: "markerValueUnsafe", severity: "warning", detail: '"<" in note breaks the ^TB block' },
    ]);
    expect(markerValueFindings([txt("b", "x«note»y", { textMode: "fb", blockWidth: 200 })], deps0(fbDirty))).toEqual([
      { objectId: "b", kind: "markerValueUnsafe", severity: "warning", detail: '"\\" in note breaks the ^FB block' },
    ]);
    // Plain (non-block) text and single-bind block fields stay quiet: single-
    // bind values are escaped at emit (encodeDefault / fdTransform).
    expect(markerValueFindings([txt("c", "x«note»y", {})], deps0(tbDirty))).toEqual([]);
    expect(markerValueFindings([txt("d", "«note»", { textMode: "tb", blockWidth: 200 })], deps0(tbDirty))).toEqual([]);
  });

  it("flags the ^BX escape char in substituted values for GS1 DataMatrix only", () => {
    const dm = (id: string, content: string): LeafObject =>
      ({ id, type: "datamatrix", x: 0, y: 0, rotation: 0,
         props: { content, gs1: true, dimension: 20, quality: 200, rotation: "N" } } as LabelObject as LeafObject);
    const dirty = [{ id: "l", name: "lot", fnNumber: 1, defaultValue: "LOT_1" }];
    expect(markerValueFindings([dm("a", "10«lot»")], { variables: dirty, csvDataset: null, csvMapping: null })).toEqual([
      { objectId: "a", kind: "gs1ValueInvalid", severity: "warning", detail: 'defaults: (10) "_" collides with the ^BX escape character' },
    ]);
    const clean = [{ id: "l", name: "lot", fnNumber: 1, defaultValue: "LOT1" }];
    expect(markerValueFindings([dm("b", "10«lot»")], { variables: clean, csvDataset: null, csvMapping: null })).toEqual([]);
    // GS1-128 has no ^BX escape char; underscore values are fine there.
    expect(markerValueFindings([bc("c", "10«lot»")], { variables: dirty, csvDataset: null, csvMapping: null })).toEqual([]);
    // Single-bind runs through the carrier transform (doubling), so no finding.
    expect(markerValueFindings([dm("d", "«lot»")], { variables: dirty, csvDataset: null, csvMapping: null })).toEqual([]);
  });

  it("validates the defaults' charset when no CSV is bound", () => {
    // Same length as a valid lot but with a char outside CSET 82 would be a
    // charset error; here an empty default in a variable AI is runtime-legal
    // at authoring but prints empty, so the defaults row flags it.
    const empty = [{ id: "l", name: "lot", fnNumber: 1, defaultValue: "" }];
    const out = markerValueFindings([bc("a", "10«lot»")], { variables: empty, csvDataset: null, csvMapping: null });
    expect(out).toEqual([
      { objectId: "a", kind: "gs1ValueInvalid", severity: "warning", detail: "defaults: (10) empty" },
    ]);
  });
});
