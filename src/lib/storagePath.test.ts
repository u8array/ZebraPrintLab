import { describe, it, expect } from "vitest";
import { parseStoragePath, formatStoragePath } from "./storagePath";

describe("storagePath", () => {
  it("parses device:name without extension", () => {
    expect(parseStoragePath("R:LOGO")).toEqual({ device: "R", name: "LOGO" });
  });

  it("parses device:name.ext and drops the extension", () => {
    expect(parseStoragePath("R:LOGO.GRF")).toEqual({ device: "R", name: "LOGO" });
  });

  it("returns null for paths without a colon", () => {
    expect(parseStoragePath("LOGO.GRF")).toBeNull();
  });

  it("returns null for paths with empty stem", () => {
    expect(parseStoragePath("R:")).toBeNull();
    expect(parseStoragePath("R:.GRF")).toBeNull();
  });

  it("formats with and without the .GRF extension", () => {
    const path = { device: "E", name: "LABEL" };
    expect(formatStoragePath(path, true)).toBe("E:LABEL.GRF");
    expect(formatStoragePath(path, false)).toBe("E:LABEL");
  });

  it("round-trips parse → format(true) for a path with extension", () => {
    const original = "R:LOGO.GRF";
    const parsed = parseStoragePath(original);
    expect(parsed).not.toBeNull();
    if (parsed) expect(formatStoragePath(parsed, true)).toBe(original);
  });
});
