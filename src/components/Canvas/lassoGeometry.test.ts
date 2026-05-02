import { describe, it, expect } from "vitest";
import { getIdsIntersectingRect, type LassoRect } from "./lassoGeometry";

interface FakeNode {
  rect: { x: number; y: number; width: number; height: number };
}

function fakeStage(nodes: Record<string, FakeNode>): {
  findOne: <T>(selector: string) => T | undefined;
} {
  return {
    findOne: <T,>(selector: string) => {
      const id = selector.replace(/^#/, "");
      const node = nodes[id];
      if (!node) return undefined;
      return { getClientRect: () => node.rect } as unknown as T;
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
