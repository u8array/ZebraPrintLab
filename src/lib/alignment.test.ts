import { describe, it, expect } from "vitest";
import { computeGroupCenterDelta } from "./alignment";

const target = { x: 0, y: 0, width: 100, height: 60 };

describe("computeGroupCenterDelta", () => {
  it("returns zero delta for empty input", () => {
    expect(computeGroupCenterDelta([], target, "both")).toEqual({ dx: 0, dy: 0 });
  });

  it("centres a single box on both axes", () => {
    const box = { id: "a", x: 0, y: 0, width: 20, height: 10 };
    expect(computeGroupCenterDelta([box], target, "both")).toEqual({
      dx: 40,
      dy: 25,
    });
  });

  it("only shifts the requested axis", () => {
    const box = { id: "a", x: 0, y: 0, width: 20, height: 10 };
    expect(computeGroupCenterDelta([box], target, "h")).toEqual({ dx: 40, dy: 0 });
    expect(computeGroupCenterDelta([box], target, "v")).toEqual({ dx: 0, dy: 25 });
  });

  it("centres the group bbox of a multi-select, preserving relative positions", () => {
    // Two boxes at x=10..30 and x=50..60 → group bbox 10..60 (width 50)
    // Centre target (width 100) → group should land at 25..75 → dx = +15
    const boxes = [
      { id: "a", x: 10, y: 5,  width: 20, height: 10 },
      { id: "b", x: 50, y: 20, width: 10, height: 10 },
    ];
    const { dx } = computeGroupCenterDelta(boxes, target, "h");
    expect(dx).toBe(15);
  });

  it("handles bboxes that already exceed the target (no clamp)", () => {
    const box = { id: "a", x: -10, y: 0, width: 200, height: 10 };
    // Centre 200-wide box on 100-wide target → leftEdge target = -50, dx = -40
    expect(computeGroupCenterDelta([box], target, "h").dx).toBe(-40);
  });

  it("respects target offset (target not anchored at origin)", () => {
    const offsetTarget = { x: 100, y: 100, width: 100, height: 60 };
    const box = { id: "a", x: 100, y: 100, width: 20, height: 10 };
    expect(computeGroupCenterDelta([box], offsetTarget, "both")).toEqual({
      dx: 40,
      dy: 25,
    });
  });
});
