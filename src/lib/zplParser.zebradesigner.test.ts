import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseZPL } from "@zplab/core/lib/zplParser";

// Authentic ZDesigner ZD230-203dpi driver output (GDI job captured via
// PrintToFile): control-char remap preamble (`CT~~CD,~CC^~CT~`), `##` framing
// junk with a raw control byte, a settings-only ^XA block, and a job block
// whose page is rasterized into a single Z64 ^GFA. Real-world import shape
// for anything printed through the Windows driver.
const fixture = readFileSync(
  path.resolve(process.cwd(), "tests/fixtures/zebradesigner_driver_zd230.prn"),
  "latin1",
);

const parse = () => parseZPL(fixture, 8);

describe("parseZPL — ZebraDesigner driver output", () => {
  it("recognizes every driver command (no unknowns)", () => {
    expect(parse().importReport.unknown).toEqual([]);
  });

  it("imports the rasterized page as a single image object", () => {
    const { objects } = parse();
    expect(objects).toHaveLength(1);
    expect(objects[0]?.type).toBe("image");
    expect(objects[0]?.x).toBe(56);
    expect(objects[0]?.y).toBe(53);
  });

  it("reads media geometry and print settings across both blocks", () => {
    const { labelConfig } = parse();
    expect(labelConfig.widthMm).toBeCloseTo(103.9);
    expect(labelConfig.heightMm).toBeCloseTo(50.8);
    expect(labelConfig.instantDarkness).toBe(15);
    expect(labelConfig.printSpeed).toBe(6);
    expect(labelConfig.mediaType).toBe("T");
    expect(labelConfig.mediaTracking).toBe("W");
    expect(labelConfig.mediaMode).toBe("T");
    expect(labelConfig.printQuantity).toBe(1);
  });

  it("routes persistent settings into the printer profile", () => {
    const { printerProfile } = parse();
    expect(printerProfile.configurationUpdate).toBe("S");
    expect(printerProfile.tearOffAdjust).toBe(0);
  });

  it("creates no variables from a fully literal job", () => {
    expect(parse().variables).toEqual([]);
  });
});
