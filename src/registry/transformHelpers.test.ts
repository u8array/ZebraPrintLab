import { describe, it, expect } from "vitest";
import { resolveBlockResizeMode } from "./transformHelpers";

describe("resolveBlockResizeMode", () => {
  it("returns the panel mode unchanged when Alt is not held", () => {
    expect(resolveBlockResizeMode("frame", false)).toBe("frame");
    expect(resolveBlockResizeMode("glyph", false)).toBe("glyph");
  });

  it("flips the panel mode while Alt is held", () => {
    expect(resolveBlockResizeMode("frame", true)).toBe("glyph");
    expect(resolveBlockResizeMode("glyph", true)).toBe("frame");
  });
});
