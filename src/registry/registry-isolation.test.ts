import { describe, it, expect } from "vitest";
import { ObjectRegistry, BARCODE_1D_TYPES, STACKED_2D_TYPES } from "./index";
import { ObjectPanels } from "./panels";

describe("registry isolation baseline", () => {
  it("registers 35 object types", () => {
    expect(Object.keys(ObjectRegistry)).toHaveLength(35);
  });

  it("classifies 20 1D barcodes", () => {
    expect(BARCODE_1D_TYPES.size).toBe(20);
  });

  it("classifies 3 stacked 2D barcodes", () => {
    expect(STACKED_2D_TYPES.size).toBe(3);
  });

  it("Core and Panels maps stay key-parallel", () => {
    expect(Object.keys(ObjectPanels).sort()).toEqual(
      Object.keys(ObjectRegistry).sort(),
    );
  });

  it("no Core entry carries a PropertiesPanel field", () => {
    for (const [type, entry] of Object.entries(ObjectRegistry)) {
      expect(entry, `Core entry for "${type}"`).not.toHaveProperty(
        "PropertiesPanel",
      );
    }
  });
});
