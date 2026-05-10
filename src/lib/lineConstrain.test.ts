import { describe, it, expect } from "vitest";
import { constrainLine } from "./lineConstrain";

describe("constrainLine — free", () => {
  it("returns Euclidean length and exact angle", () => {
    expect(constrainLine(100, 0, "free")).toEqual({ length: 100, angle: 0, dx: 100, dy: 0 });
    expect(constrainLine(0, 50, "free")).toEqual({ length: 50, angle: 90, dx: 0, dy: 50 });
    expect(constrainLine(30, 40, "free")).toEqual({ length: 50, angle: 53, dx: 30, dy: 40 });
  });

  it("clamps length to at least 1", () => {
    expect(constrainLine(0, 0, "free").length).toBe(1);
  });
});

describe("constrainLine — shift (45° steps)", () => {
  it("snaps near-horizontal drags to 0° with horizontal projection", () => {
    expect(constrainLine(100, 5, "shift")).toMatchObject({ length: 100, angle: 0 });
  });

  it("snaps near-diagonal drags to 45° with axial projection", () => {
    // (50, 50): raw 45° → projection = 50√2 ≈ 70.7
    expect(constrainLine(50, 50, "shift")).toMatchObject({ length: 71, angle: 45 });
  });

  it("snaps to negative 135° for the third quadrant", () => {
    expect(constrainLine(-100, -100, "shift")).toMatchObject({ length: 141, angle: -135 });
  });
});

describe("constrainLine — autoSnap (within ±5° of 45° steps)", () => {
  it("snaps when the raw angle is within tolerance", () => {
    // raw atan2(3,100) ≈ 1.7° → within 5° of 0° → snap
    expect(constrainLine(100, 3, "autoSnap")).toMatchObject({ length: 100, angle: 0 });
  });

  it("leaves the angle free when outside tolerance", () => {
    // raw atan2(20,100) ≈ 11.3° → > 5° from 0° → free
    const r = constrainLine(100, 20, "autoSnap");
    expect(r.angle).toBe(11);
    expect(r.length).toBe(102);
  });

  it("snaps near-diagonal drags to 45°", () => {
    // raw atan2(48,50) ≈ 43.8° → within 5° of 45° → snap
    expect(constrainLine(50, 48, "autoSnap")).toMatchObject({ angle: 45 });
  });
});

