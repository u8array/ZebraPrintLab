import { describe, it, expect } from "vitest";
import { getStepRotation, isZplRotation, nextZplRotation, objectRotation, ZPL_ROTATIONS } from "./rotation";

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

describe("nextZplRotation", () => {
  it("cycles N → R → I → B → N", () => {
    expect(nextZplRotation("N")).toBe("R");
    expect(nextZplRotation("R")).toBe("I");
    expect(nextZplRotation("I")).toBe("B");
    expect(nextZplRotation("B")).toBe("N");
  });
});

describe("getStepRotation", () => {
  it("returns the rotation letter for step-rotation objects", () => {
    expect(getStepRotation({ props: { rotation: "R" } })).toBe("R");
    expect(getStepRotation({ props: { rotation: "N" } })).toBe("N");
  });

  it("returns null when the object has no rotation prop or an invalid value", () => {
    expect(getStepRotation({ props: {} })).toBeNull();
    expect(getStepRotation({ props: { rotation: "L" } })).toBeNull();
    expect(getStepRotation({ props: { rotation: 90 } })).toBeNull();
  });

  it("returns null for objects without props (e.g. groups)", () => {
    expect(getStepRotation({})).toBeNull();
  });
});
