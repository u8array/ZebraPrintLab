import { describe, it, expect } from "vitest";
import {
  snapBoxHeight,
  positionDidMove,
  forceSquareBox,
  applyHeightSnap,
  applyModuleWidthSnap,
  applyUniformModuleSnap,
  pinInactiveEdges,
  computeNewModules,
  activeEdgesFromAnchorName,
  shrinkingBelowFloor,
  type BoundingBox,
} from "./transformerGeometry";

describe("shrinkingBelowFloor", () => {
  const box = (width: number, height: number): BoundingBox => ({ x: 0, y: 0, width, height, rotation: 0 });

  it("vetoes shrinking an axis below the floor", () => {
    expect(shrinkingBelowFloor(box(100, 100), box(5, 100), 10)).toBe(true);
    expect(shrinkingBelowFloor(box(100, 100), box(100, 5), 10)).toBe(true);
  });

  it("allows a thin box (already below floor) to grow", () => {
    // A box converted from a horizontal line: ~1.4px tall. Growing height must pass.
    expect(shrinkingBelowFloor(box(200, 1.4), box(200, 60), 10)).toBe(false);
  });

  it("allows a thin box to be widened while staying thin", () => {
    expect(shrinkingBelowFloor(box(200, 1.4), box(400, 1.4), 10)).toBe(false);
  });

  it("does not veto a normal shrink that stays above the floor", () => {
    expect(shrinkingBelowFloor(box(100, 100), box(60, 60), 10)).toBe(false);
  });

  it("allows shrinking exactly to the floor (strict <)", () => {
    expect(shrinkingBelowFloor(box(100, 100), box(10, 100), 10)).toBe(false);
  });
});

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
    const anchor = { kind: "row" as const, nodeHeight: 100, rowHeight: 20, nodeWidth: 50, moduleWidth: 2, moduleWidthMin: 1, rotation: "N" as const };
    const oldBox = { x: 0, y: 0, width: 50, height: 100, rotation: 0 };
    const newBox = { x: 0, y: 0, width: 50, height: 113, rotation: 0 };
    const result = applyHeightSnap(oldBox, newBox, 1, anchor);
    expect(result.height).toBe(115); // 113 rounds up to next 5-multiple
    expect(result.y).toBe(0);
  });

  it("pins the bottom edge for stacked-2D top-anchor resize", () => {
    const anchor = { kind: "row" as const, nodeHeight: 100, rowHeight: 20, nodeWidth: 50, moduleWidth: 2, moduleWidthMin: 1, rotation: "N" as const };
    const oldBox = { x: 0, y: 0, width: 50, height: 100, rotation: 0 };
    // Top moves UP by 30 → top-anchor resize
    const newBox = { x: 0, y: -30, width: 50, height: 130, rotation: 0 };
    const result = applyHeightSnap(oldBox, newBox, 1, anchor);
    expect(result.height).toBe(130);
    // Bottom stays where it was (oldBox.y + oldBox.height = 100)
    expect(result.y + result.height).toBe(oldBox.y + oldBox.height);
  });

  it("R/B quantise the rowHeight axis on screen WIDTH, leaving height", () => {
    // Rotated stacked: rowHeight axis = screen width. nodeWidth=100, rowHeight=20
    // → stepPx = 5; width 113 -> 115, height untouched.
    const anchor = { kind: "row" as const, nodeHeight: 50, rowHeight: 20, nodeWidth: 100, moduleWidth: 2, moduleWidthMin: 1, rotation: "R" as const };
    const oldBox = { x: 0, y: 0, width: 100, height: 50, rotation: 0 };
    const newBox = { x: 0, y: 0, width: 113, height: 50, rotation: 0 };
    const result = applyHeightSnap(oldBox, newBox, 1, anchor);
    expect(result.width).toBe(115);
    expect(result.height).toBe(50);
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
  const anchor = { kind: "moduleWidth" as const, nodeWidth: 100, nodeHeight: 40, moduleWidth: 2, rotation: "N" as const };
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

  // R/B put the moduleWidth axis on the screen height (bars turn a quarter):
  // the snap quantises height and pins the vertical edge, not width.
  describe("rotated R/B (height axis)", () => {
    const rot = { kind: "moduleWidth" as const, nodeWidth: 40, nodeHeight: 100, moduleWidth: 2, rotation: "B" as const };
    const oldRot: BoundingBox = { x: 0, y: 50, width: 40, height: 100, rotation: 0 };

    it("snaps height to the next integer moduleWidth multiple, leaves width", () => {
      const out = applyModuleWidthSnap(oldRot, { ...oldRot, height: 160 }, rot);
      expect(out.height).toBe(150);
      expect(out.width).toBe(40);
    });

    it("pins the bottom edge when the top handle was dragged", () => {
      const out = applyModuleWidthSnap(oldRot, { ...oldRot, y: 20, height: 130 }, rot);
      expect(out.y + out.height).toBe(oldRot.y + oldRot.height);
    });

    it("clamps overshoot to ^BY min (height stops, anchored edge holds)", () => {
      // Drag top way past min: height clamps to 1 module (50), bottom stays.
      const out = applyModuleWidthSnap(oldRot, { ...oldRot, y: 145, height: 5 }, rot);
      expect(out.height).toBe(50);
      expect(out.y + out.height).toBe(oldRot.y + oldRot.height);
    });
  });

  it("honours a row anchor's moduleWidthMin (CODABLOCK A = 2)", () => {
    // nodeWidth=100, moduleWidth=2 → 50px/module; shrink hard, min 2 holds at 100px.
    const row = { kind: "row" as const, nodeHeight: 40, rowHeight: 20, nodeWidth: 100, moduleWidth: 2, moduleWidthMin: 2, rotation: "N" as const };
    const out = applyModuleWidthSnap(oldBox, { ...oldBox, width: 10 }, row);
    expect(out.width).toBe(100); // 2 modules * 50px, not 1
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
