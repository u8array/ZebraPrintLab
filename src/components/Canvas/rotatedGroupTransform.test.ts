import { describe, it, expect } from "vitest";
import {
  rotatedGroupTransform,
  rotatedBboxDims,
} from "./rotatedGroupTransform";

describe("rotatedGroupTransform", () => {
  it("returns identity for N", () => {
    expect(rotatedGroupTransform("N", 100, 40)).toEqual({ x: 0, y: 0, rotation: 0 });
  });

  it("shifts +H on x for R (90° CW)", () => {
    // Upright corner (0, H) rotates to (-H, 0); shift x by +H lands it at (0, 0).
    expect(rotatedGroupTransform("R", 100, 40)).toEqual({ x: 40, y: 0, rotation: 90 });
  });

  it("shifts (+W, +H) for I (180°)", () => {
    // Upright corner (W, H) rotates to (-W, -H); shift by (W, H) lands it at (0, 0).
    expect(rotatedGroupTransform("I", 100, 40)).toEqual({ x: 100, y: 40, rotation: 180 });
  });

  it("shifts +W on y for B (-90° / 270° CW)", () => {
    // Upright corner (W, 0) rotates to (0, -W); shift y by +W lands it at (0, 0).
    expect(rotatedGroupTransform("B", 100, 40)).toEqual({ x: 0, y: 100, rotation: -90 });
  });

  it("handles zero dimensions without NaN", () => {
    expect(rotatedGroupTransform("R", 0, 0)).toEqual({ x: 0, y: 0, rotation: 90 });
  });
});

describe("rotatedBboxDims", () => {
  it("keeps axes for N and I", () => {
    expect(rotatedBboxDims("N", 100, 40)).toEqual({ width: 100, height: 40 });
    expect(rotatedBboxDims("I", 100, 40)).toEqual({ width: 100, height: 40 });
  });

  it("swaps axes for R and B", () => {
    expect(rotatedBboxDims("R", 100, 40)).toEqual({ width: 40, height: 100 });
    expect(rotatedBboxDims("B", 100, 40)).toEqual({ width: 40, height: 100 });
  });
});
