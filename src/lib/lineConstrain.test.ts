import { describe, it, expect } from "vitest";
import { constrainLine, centeredEndpointCommit } from "./lineConstrain";

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

describe("centeredEndpointCommit", () => {
  // A 0..5 horizontal line: start+end = {5,0}.
  const sum = { x: 5, y: 0 };

  it("keeps an odd length on a no-op drag (no doubled-half overshoot)", () => {
    // End dropped on its own spot must stay length 5, not jump to 6.
    expect(centeredEndpointCommit({ x: 5, y: 0 }, sum, false)).toEqual({
      x: 0, y: 0, length: 5, angle: 0,
    });
    // Start likewise.
    expect(centeredEndpointCommit({ x: 0, y: 0 }, sum, true)).toEqual({
      x: 0, y: 0, length: 5, angle: 0,
    });
  });

  it("grows symmetrically around the midpoint", () => {
    // Drag end to 7 → start mirrors to -2, length 9, centre stays at 2.5.
    expect(centeredEndpointCommit({ x: 7, y: 0 }, sum, false)).toEqual({
      x: -2, y: 0, length: 9, angle: 0,
    });
  });

  it("keeps the diagonal angle when shrinking toward the centre", () => {
    // Short diagonal near the centre {2,2}: length rounds to 1 but the angle
    // must survive (rounding both endpoints first would collapse to angle 0).
    const diag = { x: 4, y: 4 };
    expect(centeredEndpointCommit({ x: 2.4, y: 2.4 }, diag, true)).toMatchObject({
      length: 1, angle: -135,
    });
  });

  it("degenerates to a 1-dot line only at the exact centre", () => {
    expect(centeredEndpointCommit({ x: 2, y: 2 }, { x: 4, y: 4 }, true)).toEqual({
      x: 2, y: 2, length: 1, angle: 0,
    });
  });

  it("preserves a diagonal's length on a no-op drag (exact dot inputs)", () => {
    // A length-5 45° line's endpoint sits at 5*cos45 ≈ 3.54 dots. The real path
    // feeds these exact (unrounded) coords via pxToDotsExact; rounding each to
    // (4,4) first would inflate makeFree to length 6.
    const d = 5 * Math.SQRT1_2;
    expect(
      centeredEndpointCommit({ x: d, y: d }, { x: d, y: d }, false),
    ).toMatchObject({ length: 5, angle: 45 });
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

