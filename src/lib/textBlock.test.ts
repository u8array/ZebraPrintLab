import { describe, it, expect } from "vitest";
import { deriveBlockTextPatch, FB_DEFAULTS } from "./textBlock";

describe("deriveBlockTextPatch", () => {
  it("returns content-only patch for single-line text without ^FB", () => {
    expect(deriveBlockTextPatch("Hello", {})).toEqual({ content: "Hello" });
  });

  it("activates ^FB with exact line count on first newline", () => {
    expect(deriveBlockTextPatch("A\nB", {})).toEqual({
      content: "A\nB",
      blockWidth: FB_DEFAULTS.blockWidth,
      blockLines: 2,
      blockLineSpacing: FB_DEFAULTS.blockLineSpacing,
      blockJustify: FB_DEFAULTS.blockJustify,
    });
  });

  it("trailing \\n counts as a line slot", () => {
    expect(deriveBlockTextPatch("A\n", {})).toEqual({
      content: "A\n",
      blockWidth: FB_DEFAULTS.blockWidth,
      blockLines: 2,
      blockLineSpacing: FB_DEFAULTS.blockLineSpacing,
      blockJustify: FB_DEFAULTS.blockJustify,
    });
  });

  it("syncs blockLines up when content grows", () => {
    expect(deriveBlockTextPatch("A\nB\nC", { blockWidth: 400, blockLines: 2 })).toEqual({
      content: "A\nB\nC",
      blockLines: 3,
    });
  });

  it("syncs blockLines down when content shrinks", () => {
    expect(deriveBlockTextPatch("A", { blockWidth: 400, blockLines: 3 })).toEqual({
      content: "A",
      blockLines: 1,
    });
  });

  it("does not patch blockLines when count already matches", () => {
    expect(deriveBlockTextPatch("A\nB", { blockWidth: 400, blockLines: 2 })).toEqual({
      content: "A\nB",
    });
  });

  it("does not auto-activate ^FB for single-line content", () => {
    expect(deriveBlockTextPatch("Hello", {})).toEqual({ content: "Hello" });
  });
});
