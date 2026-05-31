import { describe, it, expect } from "vitest";
import { ObjectRegistry, ObjectPanels, BARCODE_1D_TYPES, STACKED_2D_TYPES } from "./index";

describe("registry isolation baseline", () => {
  it("registers 34 object types", () => {
    expect(Object.keys(ObjectRegistry)).toHaveLength(34);
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

  it("split entries surface no PropertiesPanel on the Core map", () => {
    // Derived from `<type>.panel.tsx` filenames whose stem matches a
    // registry key (filters out factory files like barcode1d.panel.tsx).
    const panelFiles = import.meta.glob("./*.panel.tsx", { eager: false });
    const splitTypes = Object.keys(panelFiles)
      .map((p) => p.replace(/^\.\//, "").replace(/\.panel\.tsx$/, ""))
      .filter((type) => type in ObjectRegistry);
    expect(splitTypes.length, "at least one split entry").toBeGreaterThan(0);
    for (const type of splitTypes) {
      expect(ObjectRegistry[type], `Core entry for "${type}"`).not.toHaveProperty(
        "PropertiesPanel",
      );
    }
  });
});
