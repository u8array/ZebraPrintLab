import { describe, it, expect } from "vitest";
import { getEntry } from "./index";

describe("serialisable capability (matches what the emitter actually emits)", () => {
  it("is set for text and free-data 1D symbologies", () => {
    for (const type of ["text", "code128", "code39", "code93", "interleaved2of5"]) {
      expect(getEntry(type)?.serialisable).toBe(true);
    }
  });

  it("is off for EAN/UPC (fixed check digit)", () => {
    for (const type of ["ean13", "ean8", "upca", "upce"]) {
      expect(getEntry(type)?.serialisable).toBeFalsy();
    }
  });

  it("is off for 2D/stacked and structured symbologies (emitters ignore ^SN/^SF)", () => {
    for (const type of ["qrcode", "datamatrix", "pdf417", "aztec", "micropdf417", "codablock", "code49", "gs1databar", "maxicode", "tlc39"]) {
      expect(getEntry(type)?.serialisable).toBeFalsy();
    }
  });
});
