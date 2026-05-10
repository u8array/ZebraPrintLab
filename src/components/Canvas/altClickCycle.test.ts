import { describe, it, expect } from "vitest";
import { nextCycleIndex } from "./altClickCycle";

describe("nextCycleIndex", () => {
  const hits = ["a", "b", "c"];
  const tol = 5;

  it("returns -1 when there are no hits", () => {
    expect(nextCycleIndex([], null, { x: 0, y: 0 }, tol)).toBe(-1);
  });

  it("starts at the topmost hit when no anchor exists", () => {
    expect(nextCycleIndex(hits, null, { x: 0, y: 0 }, tol)).toBe(0);
  });

  it("advances one layer deeper at (approximately) the same point", () => {
    const anchor = { x: 100, y: 100, id: "a" };
    expect(nextCycleIndex(hits, anchor, { x: 102, y: 99 }, tol)).toBe(1);
  });

  it("wraps from the bottom hit back to the top", () => {
    const anchor = { x: 100, y: 100, id: "c" };
    expect(nextCycleIndex(hits, anchor, { x: 100, y: 100 }, tol)).toBe(0);
  });

  it("resets to topmost when the click moves outside the tolerance window", () => {
    const anchor = { x: 100, y: 100, id: "a" };
    expect(nextCycleIndex(hits, anchor, { x: 200, y: 100 }, tol)).toBe(0);
  });

  it("resets when the previously cycled object is no longer a hit", () => {
    // e.g. the user deleted object 'a' between clicks
    const anchor = { x: 100, y: 100, id: "a" };
    expect(nextCycleIndex(["b", "c"], anchor, { x: 100, y: 100 }, tol)).toBe(0);
  });
});
