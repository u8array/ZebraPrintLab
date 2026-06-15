import { describe, it, expect, afterEach } from "vitest";
import {
  setMeasuredBounds,
  getMeasuredBounds,
  clearMeasuredBounds,
  measuredBoundsMap,
} from "./measuredBoundsCache";

afterEach(() => {
  clearMeasuredBounds("a");
  clearMeasuredBounds("b");
});

describe("measuredBoundsCache", () => {
  it("round-trips a footprint by id", () => {
    setMeasuredBounds("a", { width: 100, height: 40 });
    expect(getMeasuredBounds("a")).toEqual({ width: 100, height: 40 });
  });

  it("overwrites on re-publish", () => {
    setMeasuredBounds("a", { width: 100, height: 40 });
    setMeasuredBounds("a", { width: 120, height: 50 });
    expect(getMeasuredBounds("a")).toEqual({ width: 120, height: 50 });
  });

  it("clears an entry", () => {
    setMeasuredBounds("a", { width: 100, height: 40 });
    clearMeasuredBounds("a");
    expect(getMeasuredBounds("a")).toBeUndefined();
  });

  it("exposes the live map the align handler reads as ctx.measured", () => {
    setMeasuredBounds("b", { width: 10, height: 20 });
    expect(measuredBoundsMap().get("b")).toEqual({ width: 10, height: 20 });
  });
});
