import { describe, it, expect } from "vitest";
import { reorderForZ } from "./zorder";

const items = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (arr: { id: string }[]) => arr.map((o) => o.id);
const sel = (...s: string[]) => new Set(s);

describe("reorderForZ", () => {
  it("front moves selection to the end, preserving relative order", () => {
    const r = reorderForZ(items("a", "b", "c", "d"), sel("a", "c"), "front");
    expect(ids(r as { id: string }[])).toEqual(["b", "d", "a", "c"]);
  });

  it("back moves selection to the start, preserving relative order", () => {
    const r = reorderForZ(items("a", "b", "c", "d"), sel("b", "d"), "back");
    expect(ids(r as { id: string }[])).toEqual(["b", "d", "a", "c"]);
  });

  it("forward shifts the selected block one past the next unselected", () => {
    const r = reorderForZ(items("a", "b", "c"), sel("a"), "forward");
    expect(ids(r as { id: string }[])).toEqual(["b", "a", "c"]);
  });

  it("backward shifts the selected block one toward the start", () => {
    const r = reorderForZ(items("a", "b", "c"), sel("c"), "backward");
    expect(ids(r as { id: string }[])).toEqual(["a", "c", "b"]);
  });

  it("moves a multi-selection block as a unit on forward", () => {
    const r = reorderForZ(items("a", "b", "c", "d"), sel("a", "b"), "forward");
    expect(ids(r as { id: string }[])).toEqual(["c", "a", "b", "d"]);
  });

  it("is identity (same ref) when already at the front", () => {
    const arr = items("a", "b", "c");
    expect(reorderForZ(arr, sel("c"), "front")).toBe(arr);
    expect(reorderForZ(arr, sel("c"), "forward")).toBe(arr);
  });

  it("is identity when nothing is selected or everything is selected", () => {
    const arr = items("a", "b");
    expect(reorderForZ(arr, sel("x"), "front")).toBe(arr);
    expect(reorderForZ(arr, sel("a", "b"), "front")).toBe(arr);
  });
});
