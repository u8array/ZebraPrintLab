import { describe, it, expect } from "vitest";
import type Konva from "konva";
import { objectIdsAtPointForCycle } from "./hitTesting";
import { nextCycleIndex, ALT_CYCLE_TOL_PX } from "./altClickCycle";

// Stage double: getAllIntersections = hit graph, findOne/getClientRect = frame fallback.
function fakeStage(
  hitIds: string[],
  rects: Record<string, { x: number; y: number; width: number; height: number }>,
): Konva.Stage {
  const nodeFor = (id: string): unknown => ({
    id: () => id,
    getParent: () => null,
    getClientRect: () => rects[id],
  });
  return {
    getAllIntersections: () => hitIds.map(nodeFor),
    findOne: (sel: string) => {
      const id = sel.slice(1);
      return rects[id] ? nodeFor(id) : undefined;
    },
  } as unknown as Konva.Stage;
}

const point = { x: 50, y: 50 };
const frameRect = { x: 0, y: 0, width: 100, height: 100 };

describe("objectIdsAtPointForCycle", () => {
  // Regression: an unselected frame is hit-transparent in its interior
  // (shapeHitProps), but the alt-click cycle must still reach it.
  it("includes a frame whose interior contains the point but misses the hit graph", () => {
    const stage = fakeStage(["text1"], { box1: frameRect, text1: frameRect });
    const objects = [
      { id: "box1", type: "box" },
      { id: "text1", type: "text" },
    ];
    expect(objectIdsAtPointForCycle(stage, point, objects)).toEqual(["text1", "box1"]);
  });

  it("keeps cycling frame and text alternately even as the hit graph changes", () => {
    const objects = [
      { id: "box1", type: "box" },
      { id: "text1", type: "text" },
    ];
    // Frame selected: also in the hit graph.
    const selected = fakeStage(["box1", "text1"], { box1: frameRect, text1: frameRect });
    const hits1 = objectIdsAtPointForCycle(selected, point, objects);
    const idx1 = nextCycleIndex(hits1, { ...point, id: "text1" }, point, ALT_CYCLE_TOL_PX);
    expect(hits1[idx1]).toBe("box1");
    // Frame now deselected, gone from the hit graph, but still cyclable.
    const deselected = fakeStage(["text1"], { box1: frameRect, text1: frameRect });
    const hits2 = objectIdsAtPointForCycle(deselected, point, objects);
    const idx2 = nextCycleIndex(hits2, { ...point, id: "box1" }, point, ALT_CYCLE_TOL_PX);
    expect(hits2[idx2]).toBe("text1");
  });

  it("does not add frames whose rect misses the point, nor non-frame types", () => {
    const stage = fakeStage([], {
      box1: { x: 200, y: 200, width: 50, height: 50 },
      text1: frameRect,
    });
    const objects = [
      { id: "box1", type: "box" },
      { id: "text1", type: "text" },
    ];
    expect(objectIdsAtPointForCycle(stage, point, objects)).toEqual([]);
  });
});
