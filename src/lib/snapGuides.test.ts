import { describe, it, expect } from "vitest";
import {
  computeSnap,
  computeResizeSnap,
  deriveActiveEdges,
  SNAP_THRESHOLD_PX,
  type SnapRect,
  type ActiveEdges,
} from "./snapGuides";

const r = (id: string, x: number, y: number, w: number, h: number): SnapRect => ({
  id,
  x,
  y,
  width: w,
  height: h,
});

describe("computeSnap — drag (default activeEdges)", () => {
  describe("edge / center alignment", () => {
    it("snaps left-edge to another object's left-edge within threshold", () => {
      const dragged = r("d", 100 + 2, 200, 50, 50); // 2 px right of target
      const other = r("o", 100, 50, 60, 60);
      const { x, guides } = computeSnap(dragged, [other]);
      expect(x).toBe(100);
      expect(guides.some((g) => g.orientation === "V" && g.type === "align" && g.pos === 100)).toBe(true);
    });

    it("snaps right-edge to another object's right-edge", () => {
      // dragged.right = 150 + 50 = 200, other.right = 60 + 140 = 200
      const dragged = r("d", 152, 0, 50, 50);
      const other = r("o", 60, 200, 140, 50);
      const { x } = computeSnap(dragged, [other]);
      expect(x).toBe(150);
    });

    it("snaps center-x to another object's center-x", () => {
      // dragged center = 100 + 25 = 125, other center = 50 + 150 = 125
      const dragged = r("d", 102, 0, 50, 50);
      const other = r("o", 50, 200, 150, 50);
      const { x } = computeSnap(dragged, [other]);
      expect(x).toBe(100);
    });

    it("does not snap when distance exceeds threshold", () => {
      const dragged = r("d", 100 + SNAP_THRESHOLD_PX + 1, 0, 50, 50);
      const other = r("o", 100, 200, 50, 50);
      const { x } = computeSnap(dragged, [other]);
      expect(x).toBe(dragged.x);
    });
  });

  describe("equal spacing", () => {
    it("snaps to equal spacing between two consecutive others", () => {
      // Objects at x=0..40 and x=200..240, gap of 160 between them.
      // Place dragged (40 wide) centered between them so left-gap = right-gap = 60.
      const a = r("a", 0, 100, 40, 40);
      const b = r("b", 200, 100, 40, 40);
      const dragged = r("d", 102, 100, 40, 40); // ideal center x = 100
      const { x, guides } = computeSnap(dragged, [a, b]);
      expect(x).toBe(100);
      expect(guides.some((g) => g.type === "space")).toBe(true);
    });
  });

  describe("label alignment", () => {
    it("snaps to label center", () => {
      const labelRect = r("_lbl", 0, 0, 200, 200);
      // dragged center near label center = 100; place dragged at 73 (center 88) → not in threshold? Place at 76 (center 91) — within 6 of 100
      const dragged = r("d", 76, 0, 30, 30); // center 91, target 100, distance 9 — outside
      const inThresh = r("d", 86, 0, 30, 30); // center 101, target 100, distance 1
      const out = computeSnap(dragged, [], undefined, labelRect, labelRect);
      expect(out.x).toBe(dragged.x); // outside threshold
      const inResult = computeSnap(inThresh, [], undefined, labelRect, labelRect);
      expect(inResult.x).toBe(85); // center 100
    });
  });
});

describe("deriveActiveEdges", () => {
  it("flags only the moved edges for a BR resize", () => {
    const oldBox = r("o", 100, 100, 50, 50);
    const newBox = r("n", 100, 100, 70, 65);
    expect(deriveActiveEdges(oldBox, newBox)).toEqual({
      left: false,
      right: true,
      top: false,
      bottom: true,
    });
  });

  it("flags both edges of one axis when scaling around center", () => {
    const oldBox = r("o", 100, 100, 50, 50);
    const newBox = r("n", 90, 100, 70, 50);
    const e = deriveActiveEdges(oldBox, newBox);
    expect(e.left).toBe(true);
    expect(e.right).toBe(true);
    expect(e.top).toBe(false);
    expect(e.bottom).toBe(false);
  });

  it("ignores sub-tolerance jitter", () => {
    const oldBox = r("o", 100, 100, 50, 50);
    const newBox = r("n", 100.2, 100.1, 50.3, 50.4);
    expect(deriveActiveEdges(oldBox, newBox, 0.5)).toEqual({
      left: false,
      right: false,
      top: false,
      bottom: false,
    });
  });
});

describe("computeResizeSnap", () => {
  const allEdges: ActiveEdges = { left: true, right: true, top: true, bottom: true };
  const brOnly: ActiveEdges  = { left: false, right: true, top: false, bottom: true };
  const tlOnly: ActiveEdges  = { left: true, right: false, top: true, bottom: false };

  describe("edge alignment", () => {
    it("BR resize: snaps right edge to another object's left edge", () => {
      // dragged at x=10, w=88 → right at 98. Other.left = 100, distance 2 → within threshold.
      const newBox = r("n", 10, 10, 88, 50);
      const other  = r("o", 100, 0, 60, 200);
      const result = computeResizeSnap(newBox, [other], brOnly);
      expect(result.x).toBe(10);
      expect(result.width).toBe(90); // right snapped to 100, x kept
      expect(result.guides.some((g) => g.type === "align" && g.pos === 100)).toBe(true);
    });

    it("BR resize: snaps bottom edge to another object's top edge", () => {
      const newBox = r("n", 0, 10, 50, 87);
      const other  = r("o", 200, 100, 80, 80);
      const result = computeResizeSnap(newBox, [other], brOnly);
      expect(result.y).toBe(10);
      expect(result.height).toBe(90); // bottom 97 → 100
    });

    it("TL resize: snaps left edge to another object's right edge", () => {
      // dragged at x=98, w=50 → left at 98. Other.right = 100, distance 2.
      const newBox = r("n", 98, 0, 50, 50);
      const other  = r("o", 40, 200, 60, 50);
      const result = computeResizeSnap(newBox, [other], tlOnly);
      expect(result.x).toBe(100);
      expect(result.width).toBe(48); // right edge of newBox (148) was kept; left moved 98 → 100
    });

    it("does not snap a static edge", () => {
      // dragged at x=98, w=50, only LEFT active. Right edge sits at 148.
      // other.right = 150 (delta 2 from 148, would snap right if active).
      // other anchors (70, 110, 150) are all >= 12 px away from left=98, so the
      // active LEFT also does not snap. Right is inactive → must stay at 148.
      const newBox = r("n", 98, 0, 50, 50);
      const other  = r("o", 70, 200, 80, 30); // other.left=70, center=110, right=150
      const onlyLeft: ActiveEdges = { left: true, right: false, top: false, bottom: false };
      const result = computeResizeSnap(newBox, [other], onlyLeft);
      expect(result.x).toBe(98);
      expect(result.width).toBe(50); // right pinned, not snapped to 150
    });

    it("returns input unchanged when nothing is in threshold", () => {
      const newBox = r("n", 0, 0, 50, 50);
      const other  = r("o", 200, 200, 70, 70);
      const result = computeResizeSnap(newBox, [other], allEdges);
      expect(result).toMatchObject({ x: 0, y: 0, width: 50, height: 50 });
      expect(result.guides).toHaveLength(0);
    });
  });
});
