import { describe, it, expect } from "vitest";
import { deriveBlockTextPatch, FB_DEFAULTS } from "./textBlock";

const H = 30;
const W = 0;

describe("deriveBlockTextPatch", () => {
  it("returns content-only patch for single-line text without ^FB", () => {
    expect(deriveBlockTextPatch("Hello", {}, H, W)).toEqual({ content: "Hello" });
  });

  it("activates ^FB with the wrapped line count on first newline", () => {
    expect(deriveBlockTextPatch("A\nB", {}, H, W)).toEqual({
      content: "A\nB",
      blockWidth: FB_DEFAULTS.blockWidth,
      blockLines: 2,
      blockLineSpacing: FB_DEFAULTS.blockLineSpacing,
      blockJustify: FB_DEFAULTS.blockJustify,
    });
  });

  it("grows the line cap when explicit hard breaks exceed it", () => {
    expect(
      deriveBlockTextPatch("A\nB\nC", { blockWidth: 400, blockLines: 2 }, H, W),
    ).toEqual({ content: "A\nB\nC", blockLines: 3 });
  });

  it("does NOT shrink the cap when content shrinks (box height is user-owned)", () => {
    expect(
      deriveBlockTextPatch("A", { blockWidth: 400, blockLines: 3 }, H, W),
    ).toEqual({ content: "A" });
  });

  it("does not touch the cap when hard breaks fit within it", () => {
    expect(
      deriveBlockTextPatch("A\nB", { blockWidth: 400, blockLines: 2 }, H, W),
    ).toEqual({ content: "A\nB" });
  });

  it("does not auto-activate ^FB for single-line content", () => {
    expect(deriveBlockTextPatch("Hello", {}, H, W)).toEqual({ content: "Hello" });
  });
});
