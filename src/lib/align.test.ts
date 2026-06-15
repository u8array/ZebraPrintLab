import { describe, it, expect } from "vitest";
import {
  computeAlignDeltas,
  computeDistribute,
  computeTidy,
  type AlignBox,
} from "./align";

const box = (id: string, x: number, y: number, width: number, height: number): AlignBox => ({
  id,
  x,
  y,
  width,
  height,
});

describe("computeAlignDeltas", () => {
  // a: 10..30 x, 10..20 y ; b: 50..90 x, 30..50 y
  const a = box("a", 10, 10, 20, 10);
  const b = box("b", 50, 30, 40, 20);
  const ref = { x: 0, y: 0, width: 100, height: 100 };
  const d = (op: Parameters<typeof computeAlignDeltas>[2]) =>
    Object.fromEntries(computeAlignDeltas([a, b], ref, op).map((x) => [x.id, x]));

  it("left pins each left edge to ref.x", () => {
    expect(d("left")).toEqual({ a: { id: "a", dx: -10, dy: 0 }, b: { id: "b", dx: -50, dy: 0 } });
  });
  it("right pins each right edge to ref right", () => {
    expect(d("right")).toEqual({ a: { id: "a", dx: 70, dy: 0 }, b: { id: "b", dx: 10, dy: 0 } });
  });
  it("hcenter pins each center to ref center", () => {
    expect(d("hcenter")).toEqual({ a: { id: "a", dx: 30, dy: 0 }, b: { id: "b", dx: -20, dy: 0 } });
  });
  it("top pins each top edge to ref.y", () => {
    expect(d("top")).toEqual({ a: { id: "a", dx: 0, dy: -10 }, b: { id: "b", dx: 0, dy: -30 } });
  });
  it("bottom pins each bottom edge to ref bottom", () => {
    expect(d("bottom")).toEqual({ a: { id: "a", dx: 0, dy: 80 }, b: { id: "b", dx: 0, dy: 50 } });
  });
  it("vmiddle pins each center to ref middle", () => {
    expect(d("vmiddle")).toEqual({ a: { id: "a", dx: 0, dy: 35 }, b: { id: "b", dx: 0, dy: 10 } });
  });
});

describe("computeDistribute", () => {
  it("equalGap (h) pins the extremes and equalizes the inner gap", () => {
    // A 0..10, B 30..40, C 100..110. span 110, sizes 30, gap (110-30)/2 = 40.
    const boxes = [box("A", 0, 0, 10, 5), box("B", 30, 0, 10, 5), box("C", 100, 0, 10, 5)];
    expect(computeDistribute(boxes, "h", { kind: "equalGap" })).toEqual([
      { id: "A", dx: 0, dy: 0 },
      { id: "B", dx: 20, dy: 0 }, // 30 -> 50
      { id: "C", dx: 0, dy: 0 },
    ]);
  });

  it("equalGap respects size (mixed widths get even gaps, not even centers)", () => {
    // A 0..10, B 20..60 (w40), C 100..110. span 110, sizes 60, gap (110-60)/2 = 25.
    const boxes = [box("A", 0, 0, 10, 5), box("B", 20, 0, 40, 5), box("C", 100, 0, 10, 5)];
    expect(computeDistribute(boxes, "h", { kind: "equalGap" })[1]).toEqual({
      id: "B",
      dx: 15, // target 10+25=35, was 20
      dy: 0,
    });
  });

  it("equalGap is a no-op for fewer than 3 boxes", () => {
    const boxes = [box("A", 0, 0, 10, 5), box("B", 30, 0, 10, 5)];
    expect(computeDistribute(boxes, "h", { kind: "equalGap" })).toEqual([
      { id: "A", dx: 0, dy: 0 },
      { id: "B", dx: 0, dy: 0 },
    ]);
  });

  it("fixedGap (h) lays out from the first box with a constant gap", () => {
    const boxes = [box("A", 0, 0, 10, 5), box("B", 30, 0, 10, 5), box("C", 100, 0, 10, 5)];
    expect(computeDistribute(boxes, "h", { kind: "fixedGap", gap: 5 })).toEqual([
      { id: "A", dx: 0, dy: 0 },
      { id: "B", dx: -15, dy: 0 }, // target 15
      { id: "C", dx: -70, dy: 0 }, // target 30
    ]);
  });

  it("sorts by leading edge regardless of input order", () => {
    // Input order C,A,B; output keeps input order, deltas computed from sorted layout.
    const boxes = [box("C", 100, 0, 10, 5), box("A", 0, 0, 10, 5), box("B", 30, 0, 10, 5)];
    expect(computeDistribute(boxes, "h", { kind: "equalGap" })).toEqual([
      { id: "C", dx: 0, dy: 0 },
      { id: "A", dx: 0, dy: 0 },
      { id: "B", dx: 20, dy: 0 },
    ]);
  });

  it("distributes vertically on the y axis", () => {
    // A 0..10, B 30..40, C 100..110 in y. gap (110-30)/2 = 40, B -> 50.
    const boxes = [box("A", 0, 0, 5, 10), box("B", 0, 30, 5, 10), box("C", 0, 100, 5, 10)];
    expect(computeDistribute(boxes, "v", { kind: "equalGap" })).toEqual([
      { id: "A", dx: 0, dy: 0 },
      { id: "B", dx: 0, dy: 20 },
      { id: "C", dx: 0, dy: 0 },
    ]);
  });
});

describe("computeTidy", () => {
  it("row (wide selection): spreads across the container with equal margins + gaps, centers vertically", () => {
    // widths 10 each, sum 30, container 310 -> gap=(310-30)/4=70. cross-center 50, half-height 5 -> 45.
    const boxes = [box("A", 0, 5, 10, 10), box("B", 30, 0, 10, 10), box("C", 100, 8, 10, 10)];
    const container = { x: 0, y: 0, width: 310, height: 100 };
    expect(computeTidy(boxes, container)).toEqual([
      { id: "A", dx: 70, dy: 40 }, // target 70, cross 45-5
      { id: "B", dx: 120, dy: 45 }, // target 150
      { id: "C", dx: 130, dy: 37 }, // target 230, cross 45-8
    ]);
  });

  it("column (tall selection): spreads down the container, centers horizontally", () => {
    const boxes = [box("A", 5, 0, 10, 10), box("B", 0, 30, 10, 10), box("C", 8, 100, 10, 10)];
    const container = { x: 0, y: 0, width: 100, height: 310 };
    expect(computeTidy(boxes, container)).toEqual([
      { id: "A", dx: 40, dy: 70 }, // cross 45-5, target 70
      { id: "B", dx: 45, dy: 120 },
      { id: "C", dx: 37, dy: 130 },
    ]);
  });

  it("clamps the gap to 0 when the items overflow the container", () => {
    // sum 200 > container 150 -> gap 0, packed from container start.
    const boxes = [box("A", 0, 0, 100, 10), box("B", 300, 0, 100, 10)];
    const container = { x: 0, y: 0, width: 150, height: 20 };
    const r = computeTidy(boxes, container);
    expect(r[0]).toEqual({ id: "A", dx: 0, dy: 5 }); // target 0, cross 10-5
    expect(r[1]).toEqual({ id: "B", dx: -200, dy: 5 }); // target 100
  });

  it("is a no-op for fewer than 2 boxes", () => {
    expect(computeTidy([box("A", 0, 0, 10, 10)], { x: 0, y: 0, width: 100, height: 100 })).toEqual([
      { id: "A", dx: 0, dy: 0 },
    ]);
  });
});
