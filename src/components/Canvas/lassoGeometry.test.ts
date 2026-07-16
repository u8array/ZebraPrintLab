import { describe, it, expect } from "vitest";
import { getIdsIntersectingRect, HOLLOW_HIT_NAME, type LassoRect } from "./lassoGeometry";

interface FakeShape {
  className: "Rect" | "Ellipse";
  /** Mirrors the HOLLOW_HIT_NAME marker shapeHitProps stamps on frames. */
  hollow?: boolean;
  strokeWidth: number;
  hitStrokeWidth?: number;
  cornerRadius?: number;
}

interface FakeNode {
  rect: { x: number; y: number; width: number; height: number };
  shapes?: FakeShape[];
}

function fakeStage(nodes: Record<string, FakeNode>): {
  findOne: <T>(selector: string) => T | undefined;
} {
  return {
    findOne: <T,>(selector: string) => {
      const id = selector.replace(/^#/, "");
      const node = nodes[id];
      if (!node) return undefined;
      return {
        getClientRect: () => node.rect,
        findOne: (sel: string) => {
          const s = node.shapes?.find((c) => c.hollow);
          if (sel !== `.${HOLLOW_HIT_NAME}` || !s) return undefined;
          return {
            className: s.className,
            strokeWidth: () => s.strokeWidth,
            hitStrokeWidth: () => s.hitStrokeWidth ?? s.strokeWidth,
            cornerRadius: () => s.cornerRadius ?? 0,
          };
        },
      } as unknown as T;
    },
  };
}

describe("getIdsIntersectingRect", () => {
  const nodes = {
    a: { rect: { x: 0, y: 0, width: 50, height: 50 } },
    b: { rect: { x: 100, y: 100, width: 30, height: 30 } },
    c: { rect: { x: 60, y: 60, width: 20, height: 20 } },
  };

  it("returns only IDs whose rect intersects the lasso", () => {
    const rect: LassoRect = { x: 10, y: 10, w: 30, h: 30 };
    const result = getIdsIntersectingRect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeStage(nodes) as any,
      ["a", "b", "c"],
      rect,
    );
    expect(result).toEqual(["a"]);
  });

  it("returns multiple intersections", () => {
    const rect: LassoRect = { x: 40, y: 40, w: 80, h: 80 };
    const result = getIdsIntersectingRect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeStage(nodes) as any,
      ["a", "b", "c"],
      rect,
    );
    expect(result.sort()).toEqual(["a", "b", "c"]);
  });

  it("returns empty when no rect intersects", () => {
    const rect: LassoRect = { x: 200, y: 200, w: 10, h: 10 };
    const result = getIdsIntersectingRect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeStage(nodes) as any,
      ["a", "b", "c"],
      rect,
    );
    expect(result).toEqual([]);
  });

  it("skips IDs with no matching node", () => {
    const rect: LassoRect = { x: 0, y: 0, w: 200, h: 200 };
    const result = getIdsIntersectingRect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeStage(nodes) as any,
      ["a", "missing", "c"],
      rect,
    );
    expect(result).toEqual(["a", "c"]);
  });

  it("treats touching edges as non-intersecting (strict inequality)", () => {
    // Lasso ends exactly at node 'a' top-left (0,0)
    const rect: LassoRect = { x: -10, y: -10, w: 10, h: 10 };
    const result = getIdsIntersectingRect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeStage(nodes) as any,
      ["a"],
      rect,
    );
    expect(result).toEqual([]);
  });
});

// Regression: a marquee drawn inside an outline-only frame box captured the
// frame even though its interior is click-through (shapeHitProps parity).
describe("getIdsIntersectingRect hollow frames", () => {
  const hits = (nodes: Record<string, FakeNode>, rect: LassoRect) =>
    getIdsIntersectingRect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeStage(nodes) as any,
      Object.keys(nodes),
      rect,
    );

  const frame = (shape: Partial<FakeShape>): Record<string, FakeNode> => ({
    frame: {
      rect: { x: 0, y: 0, width: 200, height: 200 },
      shapes: [
        { className: "Rect", hollow: true, strokeWidth: 2, hitStrokeWidth: 14, ...shape },
      ],
    },
  });

  it("skips a hollow box when the lasso lies fully inside", () => {
    expect(hits(frame({}), { x: 40, y: 40, w: 100, h: 100 })).toEqual([]);
  });

  it("captures a hollow box when the lasso overlaps its border ring", () => {
    expect(hits(frame({}), { x: -20, y: 40, w: 100, h: 100 })).toEqual(["frame"]);
    expect(hits(frame({}), { x: 5, y: 40, w: 100, h: 100 })).toEqual(["frame"]);
  });

  // Regression: the ring's inner hit boundary is strokeWidth/2 + hit/2 (= 8px
  // here), not the full hitStrokeWidth; 8..14px from the edge is already free.
  it("frees the band between the ring's inner boundary and hitStrokeWidth", () => {
    expect(hits(frame({}), { x: 10, y: 40, w: 100, h: 100 })).toEqual([]);
  });

  // Regression: unmarked shapes (solid boxes, blank-text placeholder, barcode/
  // image fallback rects, selected frames) hit on their fill and stay captured;
  // only shapes carrying shapeHitProps' hollow marker are interior-transparent.
  it("keeps capturing shapes without the hollow marker from inside", () => {
    const inside: LassoRect = { x: 40, y: 40, w: 100, h: 100 };
    expect(hits(frame({ hollow: false, strokeWidth: 0 }), inside)).toEqual(["frame"]);
    expect(hits(frame({ hollow: false, strokeWidth: 3 }), inside)).toEqual(["frame"]);
  });

  // Free interior of a rounded frame is itself a rounded rect (path radius 40
  // minus hit/2 = 33, inset 8), not the central rectangle.
  it("rounded corners: free area follows the inner rounding", () => {
    // Diagonal corner zone but inside the r=33 inner rounding: free.
    expect(hits(frame({ cornerRadius: 40 }), { x: 20, y: 20, w: 30, h: 30 })).toEqual([]);
    // Tight against the corner: outside the inner rounding, ring hit.
    expect(hits(frame({ cornerRadius: 40 }), { x: 10, y: 10, w: 20, h: 20 })).toEqual(["frame"]);
    expect(hits(frame({ cornerRadius: 40 }), { x: 60, y: 60, w: 60, h: 60 })).toEqual([]);
  });

  it("skips a hollow ellipse only when all lasso corners are inside the ring", () => {
    const ellipse: Record<string, FakeNode> = {
      ring: {
        rect: { x: 0, y: 0, width: 200, height: 200 },
        shapes: [{ className: "Ellipse", hollow: true, strokeWidth: 2, hitStrokeWidth: 14 }],
      },
    };
    expect(hits(ellipse, { x: 80, y: 80, w: 40, h: 40 })).toEqual([]);
    // Same size near the bbox corner: corners leave the inner ellipse.
    expect(hits(ellipse, { x: 20, y: 20, w: 40, h: 40 })).toEqual(["ring"]);
  });
});
