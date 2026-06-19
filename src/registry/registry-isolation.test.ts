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
