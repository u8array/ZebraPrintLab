import { describe, it, expect } from "vitest";
import {
  snapBoxHeight,
  pinBottomEdge,
  isTopAnchorResize,
  transformNodeTopLeft,
  positionDidMove,
  forceSquareBox,
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

describe("transformNodeTopLeft", () => {
  it("passes top-left-anchored nodes through unchanged", () => {
    // Rect / Image / Text use their top-left as the Konva origin.
    const result = transformNodeTopLeft(100, 50, 200, 100, 1.5, 1, false);
    expect(result).toEqual({ x: 100, y: 50 });
  });

  it("subtracts half the visual size for center-anchored nodes (Ellipse)", () => {
    // Ellipse with intrinsic size 100x80, scaled 2x in both axes.
    // node.x()/y() are the center; visual radius = nodeSize * scale / 2.
    const result = transformNodeTopLeft(200, 100, 100, 80, 2, 2, true);
    expect(result).toEqual({ x: 100, y: 20 });
  });

  it("uses the captured (pre-reset) node size, not the post-reset one", () => {
    // Even when scale is no longer 1 conceptually, the formula uses the
    // intrinsic nodeWidth/nodeHeight times the scale to derive visual size.
    const result = transformNodeTopLeft(150, 150, 50, 50, 4, 4, true);
    expect(result.x).toBe(50); // 150 - (50 * 4) / 2 = 150 - 100
    expect(result.y).toBe(50);
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
