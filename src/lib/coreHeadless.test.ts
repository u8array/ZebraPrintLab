import { describe, it, expect, vi, afterEach } from "vitest";
import { generateZPL } from "@zplab/core/lib/zplGenerator";
import { parseZPL } from "@zplab/core/lib/zplParser";
import { rasterizeMono } from "@zplab/core/lib/imageToZpl";
import { decodeGraphicToImage } from "@zplab/core/lib/zplParser/decoders/graphic";
import { measureInkWidthPx } from "@zplab/core/lib/labelGeometry/measureTextDots";
import { safeLocalStorageRemove, safeLocalStorageSet } from "@zplab/core/lib/localStorageBucket";
import type { LabelConfig } from "@zplab/core/types/LabelConfig";
import type { LabelObject } from "@zplab/core/types/Group";

// @zplab/core must survive without browser globals, degrading instead of
// throwing; this is the contract the MCP server runs on.
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
