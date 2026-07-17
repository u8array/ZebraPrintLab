import { describe, it, expect } from "vitest";
import { symbol, type SymbolProps } from "@zplab/core/registry/symbol";
import type { LabelObjectBase } from "@zplab/core/types/LabelObject";
const baseObj = (
  props: Partial<SymbolProps> = {},
): LabelObjectBase & { props: SymbolProps } => ({
  id: "s1",
  type: "symbol",
  x: 0,
  y: 0,
  rotation: 0,
  props: {
    symbol: "B",
    height: 30,
    width: 30,
    rotation: "N",
    ...props,
  },
});

const ctx = (sx: number, sy: number) => ({
  sx,
  sy,
  snap: (v: number) => v,
  nodeHeight: 0,
  anchor: null,
});

describe("symbol — commitTransform", () => {
  it("scales width by sx and height by sy for rotation N", () => {
    const result = symbol.commitTransform?.(baseObj({ rotation: "N" }), ctx(2, 1.5));
    expect(result).toEqual({ width: 60, height: 45 });
  });

  it("swaps sx/sy for rotation R (90°) so vertical drag scales height", () => {
    const result = symbol.commitTransform?.(baseObj({ rotation: "R" }), ctx(2, 1.5));
    // R rotation: pre-rotation height is the user's screen-horizontal axis (sx),
    // pre-rotation width is the screen-vertical axis (sy).
    expect(result).toEqual({ width: 45, height: 60 });
  });

  it("rotation I keeps the natural axis mapping (180° flip)", () => {
    const result = symbol.commitTransform?.(baseObj({ rotation: "I" }), ctx(2, 1.5));
    expect(result).toEqual({ width: 60, height: 45 });
  });

  it("swaps sx/sy for rotation B (270°) like R", () => {
    const result = symbol.commitTransform?.(baseObj({ rotation: "B" }), ctx(2, 1.5));
    expect(result).toEqual({ width: 45, height: 60 });
  });

  it("clamps the result to at least 1 (zero-scale drag must not produce 0)", () => {
    const result = symbol.commitTransform?.(baseObj(), ctx(0, 0));
    expect(result?.width).toBeGreaterThanOrEqual(1);
    expect(result?.height).toBeGreaterThanOrEqual(1);
  });

  it("rounds to the snap grid", () => {
    const snap5 = (v: number) => Math.round(v / 5) * 5;
    const result = symbol.commitTransform?.(baseObj({ width: 30, height: 30 }), {
      sx: 1.1,
      sy: 1.1,
      snap: snap5,
      nodeHeight: 0,
      anchor: null,
    });
    // 30 * 1.1 = 33 → snap5 → 35
    expect(result).toEqual({ width: 35, height: 35 });
  });
});
