import { describe, it, expect, vi, afterEach } from "vitest";
import { generateZPL } from "./zplGenerator";
import { parseZPL } from "./zplParser";
import { rasterizeMono } from "./imageToZpl";
import { decodeGraphicToImage } from "./zplParser/decoders/graphic";
import { measureInkWidthPx } from "./labelGeometry/measureTextDots";
import { safeLocalStorageRemove, safeLocalStorageSet } from "./localStorageBucket";
import type { LabelConfig } from "../types/LabelConfig";
import type { LabelObject } from "../types/Group";

// Regression for the core extraction: every closure of the future @zplab/core
// package (generator, parser, registry) must survive WITHOUT browser globals,
// degrading instead of throwing. This is the contract the MCP server runs on.
const headless = () => {
  vi.stubGlobal("document", undefined);
  vi.stubGlobal("localStorage", undefined);
  vi.stubGlobal("Image", undefined);
  vi.stubGlobal("FontFace", undefined);
};

afterEach(() => vi.unstubAllGlobals());

const LABEL: LabelConfig = { widthMm: 100, heightMm: 50, dpmm: 8 };

describe("core closures without browser globals", () => {
  it("generateZPL emits text + barcode", () => {
    headless();
    const objs = [
      { id: "t", type: "text", x: 10, y: 10, rotation: 0,
        props: { content: "Hi", fontHeight: 30, fontWidth: 0, rotation: "N", reverse: false } },
      { id: "b", type: "code128", x: 10, y: 60, rotation: 0,
        props: { content: "12345", height: 80, moduleWidth: 2, printInterpretation: true,
          checkDigit: false, rotation: "N" } },
    ] as unknown as LabelObject[];
    const zpl = generateZPL(LABEL, objs);
    expect(zpl).toContain("^FDHi");
    expect(zpl).toContain("^BCN,80");
  });

  it("parseZPL degrades an inline ^GFA to the browserLimit path", () => {
    headless();
    const result = parseZPL("^XA^FO10,10^GFA,8,8,1,FFFFFFFFFFFFFFFF^FS^XZ");
    // No canvas: the graphic cannot become an editable bitmap; the parse
    // itself must not throw.
    expect(result).toBeDefined();
  });

  it("raster/measure/storage helpers degrade instead of throwing", () => {
    headless();
    expect(rasterizeMono({ naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement, 80, 128)).toBeNull();
    expect(decodeGraphicToImage("FF", "A", 1, "1", "1", "x")).toBeNull();
    expect(measureInkWidthPx("abc", 30, "monospace")).toBeGreaterThan(0);
    expect(() => {
      safeLocalStorageSet("k", "v");
      safeLocalStorageRemove("k");
    }).not.toThrow();
  });
});
