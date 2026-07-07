import { describe, expect, it } from "vitest";
import { formatTemplate } from "./formatTemplate";

describe("formatTemplate", () => {
  it("substitutes named placeholders", () => {
    expect(formatTemplate("Update {version} available", { version: "1.2.0" })).toBe(
      "Update 1.2.0 available",
    );
  });

  it("replaces every occurrence of a placeholder", () => {
    expect(formatTemplate("{v} and {v}", { v: "x" })).toBe("x and x");
  });

  it("does not expand $-patterns in values", () => {
    expect(formatTemplate("failed: {error}", { error: "code $' at $&" })).toBe(
      "failed: code $' at $&",
    );
  });

  it("leaves unknown placeholders untouched", () => {
    expect(formatTemplate("{a} {b}", { a: "1" })).toBe("1 {b}");
  });
});
