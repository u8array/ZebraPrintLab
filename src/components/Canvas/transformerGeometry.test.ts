import { describe, it, expect } from "vitest";
import {
  snapBoxHeight,
  pinBottomEdge,
  isTopAnchorResize,
  positionDidMove,
  forceSquareBox,
  applyHeightSnap,
  applyModuleWidthSnap,
  applyUniformModuleSnap,
  pinInactiveEdges,
  computeNewModules,
  activeEdgesFromAnchorName,
  type BoundingBox,
} from "./transformerGeometry";

describe("snapBoxHeight", () => {
  it("rounds to the nearest multiple of stepPx", () => {
    expect(snapBoxHeight(33, 10)).toBe(30);
    expect(snapBoxHeight(36, 10)).toBe(40);
  });

  it("never returns less than stepPx", () => {
    expect(snapBoxHeight(0, 10)).toBe(10);
    expect(snapBoxHeight(3, 10)).toBe(10);
  });

  it("works with fractional stepPx", () => {
    expect(snapBoxHeight(7.5, 2.5)).toBe(7.5);
    expect(snapBoxHeight(8.1, 2.5)).toBe(7.5);
  });
});

describe("pinBottomEdge", () => {
  const oldBox = { x: 0, y: 100, width: 50, height: 60, rotation: 0 };

  it("anchors the bottom edge while reducing height", () => {
    const result = pinBottomEdge(oldBox, { ...oldBox, y: 130, height: 30 }, 30);
    expect(result.y).toBe(130);
    expect(result.height).toBe(30);
    expect(result.y + result.height).toBe(oldBox.y + oldBox.height);
  });

  it("anchors the bottom edge while expanding height", () => {
    const result = pinBottomEdge(oldBox, { ...oldBox, y: 50, height: 110 }, 110);
    expect(result.y).toBe(50);
    expect(result.height).toBe(110);
    expect(result.y + result.height).toBe(oldBox.y + oldBox.height);
  });
});

describe("isTopAnchorResize", () => {
  const oldBox = { x: 0, y: 100, width: 50, height: 60, rotation: 0 };

  it("returns true when y moves more than threshold", () => {
    expect(isTopAnchorResize(oldBox, { ...oldBox, y: 105 }, 1)).toBe(true);
  });

  it("returns false when y stays within threshold", () => {
    expect(isTopAnchorResize(oldBox, { ...oldBox, y: 100.3 }, 1)).toBe(false);
  });

  it("returns false on bottom-anchor resize (y unchanged)", () => {
    expect(isTopAnchorResize(oldBox, { ...oldBox, height: 80 }, 1)).toBe(false);
  });
});

describe("positionDidMove", () => {
  it("returns false when the position matches within the tolerance", () => {
    expect(positionDidMove(100, 100)).toBe(false);
    expect(positionDidMove(100.4, 100)).toBe(false);
    expect(positionDidMove(99, 100)).toBe(false);
  });

  it("returns true once the delta exceeds the tolerance", () => {
    expect(positionDidMove(102, 100)).toBe(true);
    expect(positionDidMove(80, 100)).toBe(true);
  });
});

describe("applyHeightSnap", () => {
  // Captured from a real low-zoom box bottom-edge resize that triggered
  // the runaway top-anchor pin. dotPx ≈ 0.116 (≈ 4.3 px / dot at fit-zoom),
  // newBox.y drifted 0.8–10 px from oldBox.y due to Konva FP scale-driven
  // node-position updates, comfortably above the prior `dotPx * 0.5`
  // threshold, which incorrectly identified each frame as top-anchor and
  // pinned the bottom edge, marching the box upward.
  const oldBoxLowZoom = { x: 100, y: 346.809, width: 50, height: 27.426, rotation: 0 };
  const newBoxLowZoom = { x: 100, y: 347.611, width: 50, height: 27.826, rotation: 0 };
  const dotPxLowZoom = 0.232; // threshold dotPx * 0.5 = 0.116 → false positive

  it("returns newBox unchanged for shapes without a row anchor (regression: low-zoom drift)", () => {
    const result = applyHeightSnap(oldBoxLowZoom, newBoxLowZoom, dotPxLowZoom, null);
    expect(result).toEqual(newBoxLowZoom);
  });

  it("row-quantises the height for stacked-2D barcodes with a row anchor", () => {
    // anchor: nodeHeight=100, rowHeight=20 → stepPx = 5
    const anchor = { kind: "row" as const, nodeHeight: 100, rowHeight: 20, nodeWidth: 50, moduleWidth: 2 };
    const oldBox = { x: 0, y: 0, width: 50, height: 100, rotation: 0 };
    const newBox = { x: 0, y: 0, width: 50, height: 113, rotation: 0 };
    const result = applyHeightSnap(oldBox, newBox, 1, anchor);
    expect(result.height).toBe(115); // 113 rounds up to next 5-multiple
    expect(result.y).toBe(0);
  });

  it("pins the bottom edge for stacked-2D top-anchor resize", () => {
    const anchor = { kind: "row" as const, nodeHeight: 100, rowHeight: 20, nodeWidth: 50, moduleWidth: 2 };
    const oldBox = { x: 0, y: 0, width: 50, height: 100, rotation: 0 };
    // Top moves UP by 30 → top-anchor resize
    const newBox = { x: 0, y: -30, width: 50, height: 130, rotation: 0 };
    const result = applyHeightSnap(oldBox, newBox, 1, anchor);
    expect(result.height).toBe(130);
    // Bottom stays where it was (oldBox.y + oldBox.height = 100)
    expect(result.y + result.height).toBe(oldBox.y + oldBox.height);
  });
});

describe("pinInactiveEdges + applyHeightSnap (multi-frame regression)", () => {
  // Invariant: on a pure bottom-edge drag the top stays at start.y even
  // when Konva's per-frame newBox.y drifts sub-pixel.

  // Captured from the buggy reproduction at viewRotation=0, low zoom:
  // Konva's per-frame y drifts by < 2 px on a pure bottom-edge drag
  // (above 2 px would be a real intentional top-edge drag).
  const start = { x: 100, y: 200, width: 80, height: 50, rotation: 0 };
  const driftedFrames = [
    { y: 200.4, height: 51.2 },
    { y: 200.9, height: 52.7 },
    { y: 201.5, height: 54.0 },
    { y: 199.8, height: 55.3 },
    { y: 201.2, height: 56.1 },
    { y: 200.6, height: 57.4 },
  ];
  const dotPx = 0.232; // representative low-zoom value (≈ 4.3 dots / px)

  it("keeps the top edge pinned to startBox.y across drifting frames", () => {
    let oldBox: BoundingBox = start;
    for (const frame of driftedFrames) {
      const newBox: BoundingBox = { ...oldBox, y: frame.y, height: frame.height };
      const afterSnap = applyHeightSnap(oldBox, newBox, dotPx, null);
      const active = {
        left:  Math.abs(afterSnap.x - start.x) > 2,
        right: Math.abs((afterSnap.x + afterSnap.width) - (start.x + start.width)) > 2,
        top:   Math.abs(afterSnap.y - start.y) > 2,
        bottom: Math.abs((afterSnap.y + afterSnap.height) - (start.y + start.height)) > 2,
      };
      const pinned = pinInactiveEdges(afterSnap, start, active);
      // Top edge invariant: stays at start.y (within float-cmp tolerance).
      expect(pinned.y).toBe(start.y);
      // Width and x untouched (no horizontal drag).
      expect(pinned.x).toBe(start.x);
      expect(pinned.width).toBe(start.width);
      // Height must reflect the grown bottom edge.
      expect(pinned.height).toBeGreaterThanOrEqual(start.height);
      oldBox = pinned;
    }
  });

  it("does not let cumulative drift carry the box out of frame", () => {
    // After 6 frames of drift, top must still be at start.y, not drifted up.
    let oldBox: BoundingBox = start;
    for (const frame of driftedFrames) {
      const newBox: BoundingBox = { ...oldBox, y: frame.y, height: frame.height };
      const afterSnap = applyHeightSnap(oldBox, newBox, dotPx, null);
      const active = {
        left: false, right: false,
        top: Math.abs(afterSnap.y - start.y) > 2,
        bottom: Math.abs((afterSnap.y + afterSnap.height) - (start.y + start.height)) > 2,
      };
      oldBox = pinInactiveEdges(afterSnap, start, active);
    }
    // Final state: top has not drifted; bottom is wherever the user dragged.
    expect(oldBox.y).toBe(start.y);
  });
});

describe("forceSquareBox", () => {
  const oldBox = { x: 100, y: 100, width: 50, height: 50, rotation: 0 };

  it("clamps to max axis when dragging the bottom-right corner", () => {
    const newBox = { x: 100, y: 100, width: 80, height: 60, rotation: 0 };
    expect(forceSquareBox(oldBox, newBox)).toEqual({
      x: 100, y: 100, width: 80, height: 80, rotation: 0,
    });
  });

  it("pins the bottom-right corner when dragging the top-left", () => {
    const newBox = { x: 70, y: 80, width: 80, height: 70, rotation: 0 };
    // Bottom-right of oldBox = (150, 150). Square of size 80 must end there.
    expect(forceSquareBox(oldBox, newBox)).toEqual({
      x: 70, y: 70, width: 80, height: 80, rotation: 0,
    });
  });

  it("pins the bottom-left corner when dragging the top-right", () => {
    const newBox = { x: 100, y: 80, width: 70, height: 70, rotation: 0 };
    expect(forceSquareBox(oldBox, newBox)).toEqual({
      x: 100, y: 80, width: 70, height: 70, rotation: 0,
    });
  });

  it("pins the top-right corner when dragging the bottom-left", () => {
    const newBox = { x: 80, y: 100, width: 70, height: 70, rotation: 0 };
    // Top-right of oldBox = (150, 100). Square of size 70 stays there.
    expect(forceSquareBox(oldBox, newBox)).toEqual({
      x: 80, y: 100, width: 70, height: 70, rotation: 0,
    });
  });
});

describe("computeNewModules", () => {
  it("rounds to integer module count", () => {
    expect(computeNewModules(4, 1.4, 1, 10)).toBe(6);
    expect(computeNewModules(3, 0.9, 1, 10)).toBe(3);
  });

  it("clamps to min", () => {
    expect(computeNewModules(4, 0.1, 2, 10)).toBe(2);
  });

  it("clamps to max", () => {
    expect(computeNewModules(4, 5, 1, 10)).toBe(10);
  });
});

describe("applyModuleWidthSnap", () => {
  const anchor = { kind: "moduleWidth" as const, nodeWidth: 100, moduleWidth: 2 };
  const oldBox: BoundingBox = { x: 50, y: 0, width: 100, height: 40, rotation: 0 };

  it("snaps width to the next integer moduleWidth multiple", () => {
    const newBox: BoundingBox = { ...oldBox, width: 160 };
    expect(applyModuleWidthSnap(oldBox, newBox, anchor).width).toBe(150);
  });

  it("pins the right edge when the left handle was dragged", () => {
    const newBox: BoundingBox = { ...oldBox, x: 20, width: 130 };
    const out = applyModuleWidthSnap(oldBox, newBox, anchor);
    expect(out.x + out.width).toBe(oldBox.x + oldBox.width);
  });

  it("clamps to ^BY range [1,10]", () => {
    const newBox: BoundingBox = { ...oldBox, width: 1000 };
    expect(applyModuleWidthSnap(oldBox, newBox, anchor).width).toBe(500);
  });

  it("no-ops when anchor kind is wrong", () => {
    const newBox: BoundingBox = { ...oldBox, width: 160 };
    expect(applyModuleWidthSnap(oldBox, newBox, null).width).toBe(160);
  });
});

describe("applyUniformModuleSnap", () => {
  const anchor = (edges: { left: boolean; right: boolean; top: boolean; bottom: boolean }) => ({
    kind: "uniformModule" as const,
    nodeSize: 100,
    modules: 4,
    min: 1,
    max: 10,
    edges,
  });
  const oldBox: BoundingBox = { x: 50, y: 50, width: 100, height: 100, rotation: 0 };

  it("snaps to whole-module square (bottom-right grab keeps top-left)", () => {
    const a = anchor({ left: false, right: true, top: false, bottom: true });
    const out = applyUniformModuleSnap(oldBox, { ...oldBox, width: 140, height: 140 }, a);
    expect(out.width).toBe(150);
    expect(out.height).toBe(150);
    expect(out.x).toBe(50);
    expect(out.y).toBe(50);
  });

  it("pins bottom-right when top-left was grabbed", () => {
    const a = anchor({ left: true, right: false, top: true, bottom: false });
    const out = applyUniformModuleSnap(
      oldBox,
      { x: 10, y: 10, width: 140, height: 140, rotation: 0 },
      a,
    );
    expect(out.width).toBe(150);
    expect(out.x + out.width).toBe(oldBox.x + oldBox.width);
    expect(out.y + out.height).toBe(oldBox.y + oldBox.height);
  });

  it("clamps to anchor min", () => {
    const a = anchor({ left: false, right: true, top: false, bottom: true });
    const out = applyUniformModuleSnap(oldBox, { ...oldBox, width: 5, height: 5 }, a);
    expect(out.width).toBe(25);
  });

  it("no-ops on a non-uniform-2D anchor", () => {
    const out = applyUniformModuleSnap(oldBox, { ...oldBox, width: 140 }, null);
    expect(out.width).toBe(140);
  });
});

describe("activeEdgesFromAnchorName", () => {
  it("decodes corner anchor names", () => {
    expect(activeEdgesFromAnchorName("top-left"))
      .toEqual({ left: true, right: false, top: true, bottom: false });
    expect(activeEdgesFromAnchorName("bottom-right"))
      .toEqual({ left: false, right: true, top: false, bottom: true });
  });

  it("decodes side anchor names", () => {
    expect(activeEdgesFromAnchorName("middle-right"))
      .toEqual({ left: false, right: true, top: false, bottom: false });
  });

  it("returns null for unknown or null input", () => {
    expect(activeEdgesFromAnchorName(null)).toBeNull();
    expect(activeEdgesFromAnchorName("rotater")).toBeNull();
  });
});
