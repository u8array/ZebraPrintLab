import { describe, it, expect } from "vitest";
import { getEntry } from "@zplab/core/registry";
import { serialDisablePatch, serialEnablePatch, SERIAL_DEFAULT } from "@zplab/core/registry/serialField";

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

describe("serialEnablePatch / serialDisablePatch (checkbox props patches)", () => {
  it("on: defaults the mode, filters the seed, snapshots the raw template", () => {
    expect(serialEnablePatch("«sku»-7", "AB-12 34")).toEqual({
      serial: { ...SERIAL_DEFAULT },
      content: "AB1234",
      preSerialContent: "«sku»-7",
    });
  });

  it("on: intersects with the symbology charset", () => {
    expect(serialEnablePatch("AB1234", "AB1234", { charset: "0-9" }).content).toBe("1234");
  });

  it("off: restores the snapshot and clears it", () => {
    expect(serialDisablePatch({ preSerialContent: "«sku»-7" })).toEqual({
      serial: undefined,
      preSerialContent: undefined,
      content: "«sku»-7",
    });
  });

  it("off without a snapshot (parser import) keeps the seed", () => {
    expect(serialDisablePatch({})).toEqual({ serial: undefined, preSerialContent: undefined });
  });
});
