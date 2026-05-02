import { describe, it, expect } from "vitest";
import {
  snapBoxHeight,
  pinBottomEdge,
  isTopAnchorResize,
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
