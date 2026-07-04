import { describe, it, expect, vi } from "vitest";
// Panels pull in Headless UI, whose react-aria dep runs global focus setup at
// import and needs DOM globals (this suite is node-env, key checks only, never
// renders). Stub it so the import chain stays node-safe.
vi.mock("@headlessui/react", () => {
  const Stub = () => null;
  return { Listbox: Stub, ListboxButton: Stub, ListboxOptions: Stub, ListboxOption: Stub };
});
import { ObjectRegistry, BARCODE_1D_TYPES, STACKED_2D_TYPES } from "./index";
import { ObjectPanels } from "./panels";

describe("registry isolation baseline", () => {
  it("registers 34 object types", () => {
    expect(Object.keys(ObjectRegistry)).toHaveLength(34);
  });

  // Exact membership, not just size: the sets are derived from each entry's
  // barcodeClass, and emit/rotation/bounds read them, so a reclassified or
  // forgotten type must fail loudly here, not degrade silently on canvas.
  it("classifies the 1D barcodes by barcodeClass", () => {
    expect([...BARCODE_1D_TYPES].sort()).toEqual([
      "codabar", "code11", "code128", "code39", "code49", "code93", "ean13",
      "ean8", "gs1databar", "industrial2of5", "interleaved2of5", "logmars",
      "msi", "planet", "plessey", "postal", "standard2of5", "upcEanExtension",
      "upca", "upce",
    ]);
  });

  it("classifies the stacked 2D barcodes by barcodeClass", () => {
    expect([...STACKED_2D_TYPES].sort()).toEqual(["codablock", "micropdf417", "pdf417"]);
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
