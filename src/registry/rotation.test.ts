import { describe, it, expect } from "vitest";
import { isZplRotation, objectRotation, ZPL_ROTATIONS } from "./rotation";

describe("isZplRotation", () => {
  it("accepts the four ZPL letters", () => {
    for (const r of ZPL_ROTATIONS) {
      expect(isZplRotation(r)).toBe(true);
    }
  });

  it("rejects bwip-js's L (not a ZPL letter) and other strings", () => {
    expect(isZplRotation("L")).toBe(false);
    expect(isZplRotation("n")).toBe(false);
    expect(isZplRotation("")).toBe(false);
    expect(isZplRotation("RR")).toBe(false);
  });
});

describe("objectRotation", () => {
  it("returns the rotation when valid", () => {
    expect(objectRotation({ rotation: "R" })).toBe("R");
    expect(objectRotation({ rotation: "B" })).toBe("B");
  });

  it("falls back to N when missing or invalid", () => {
    expect(objectRotation({})).toBe("N");
    expect(objectRotation({ rotation: undefined })).toBe("N");
    expect(objectRotation({ rotation: "L" })).toBe("N");
    expect(objectRotation({ rotation: "garbage" })).toBe("N");
  });
});
