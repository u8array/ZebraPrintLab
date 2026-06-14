import { describe, it, expect } from "vitest";
import {
  zebraGlyphAdvanceDots,
  zebraLineWidthDots,
  zebraAlignOffsetDots,
  zebraHangingIndentOffsetDots,
  zebraJustifyGapDots,
  blockJustifyWordPositions,
  isBlockTooNarrow,
  blockBoundsDots,
  blockLineStartDots,
  blockLineStepDots,
  blockWordAdvanceDots,
  blockReflowGeometry,
  wrapBlockLines,
} from "./zebraTextLayout";

describe("wrapBlockLines", () => {
  // measure = 10 dots per char, so block 50 fits 5 chars.
  const wrap = (s: string, w = 50) =>
    wrapBlockLines(s, w, (line) => line.length * 10);

  it("greedy word-wraps to the block width", () => {
    expect(wrap("ab cd ef gh")).toEqual(["ab cd", "ef gh"]);
  });

  it("character-breaks a word wider than the block", () => {
    expect(wrap("abcdefghij")).toEqual(["abcde", "fghij"]);
  });

  it("collapses runs of spaces to one", () => {
    expect(wrap("a    b")).toEqual(["a b"]);
  });

  it("honours hard newline breaks and keeps blank segments", () => {
    expect(wrap("ab\ncd")).toEqual(["ab", "cd"]);
    expect(wrap("ab\n\ncd")).toEqual(["ab", "", "cd"]);
  });

  it("drops soft hyphens (U+00AD), handled by the editor layer", () => {
    expect(wrap("ab" + String.fromCharCode(0xad) + "cd")).toEqual(["abcd"]);
  });

  it("does not wrap when blockWidth <= 0 (splits on newline only)", () => {
    expect(
      wrapBlockLines("a very long line indeed", 0, (line) => line.length * 10),
    ).toEqual(["a very long line indeed"]);
  });
});

describe("zebraGlyphAdvanceDots", () => {
  it("returns fontWidth when explicitly set", () => {
    expect(zebraGlyphAdvanceDots(30, 20)).toBe(20);
  });

  it("uses the A0 default 5:9 aspect when fontWidth is 0", () => {
    // 30 × 5/9 = 16.666…
    expect(zebraGlyphAdvanceDots(30, 0)).toBeCloseTo(30 * (5 / 9));
    expect(zebraGlyphAdvanceDots(45, 0)).toBeCloseTo(25);
  });
});

describe("zebraLineWidthDots", () => {
  it("multiplies glyph count by the explicit fontWidth", () => {
    expect(zebraLineWidthDots("ABCDE", 30, 20)).toBe(100);
  });

  it("sums per-char advance ratios from the calibrated table when fontWidth is 0", () => {
    // A:0.555, B:0.555, C:0.535, D:0.59, E:0.5 -> 2.735 × 30 = 82.05
    expect(zebraLineWidthDots("ABCDE", 30, 0)).toBeCloseTo(82.05);
  });

  it("uses the 5/9 fallback for chars outside the calibration table", () => {
    // ™ isn't in the table; falls back to 30 * 5/9 = 16.667
    expect(zebraLineWidthDots("™", 30, 0)).toBeCloseTo(30 * (5 / 9));
  });

  it("returns 0 for empty line", () => {
    expect(zebraLineWidthDots("", 30, 0)).toBe(0);
  });
});

describe("zebraAlignOffsetDots", () => {
  it("L → 0 offset", () => {
    expect(zebraAlignOffsetDots(100, 400, "L")).toBe(0);
  });

  it("C → half the leftover space", () => {
    expect(zebraAlignOffsetDots(100, 400, "C")).toBe(150);
  });

  it("R → all leftover space on the left", () => {
    expect(zebraAlignOffsetDots(100, 400, "R")).toBe(300);
  });

  it("J → same as L (canvas does not visualise inter-word stretch)", () => {
    expect(zebraAlignOffsetDots(150, 400, "J")).toBe(0);
  });

  it("C subtracts the phantom trailing space (Labelary center bias)", () => {
    // (400 - 100 - 20) / 2 = 140; only C shifts, R/L are unaffected.
    expect(zebraAlignOffsetDots(100, 400, "C", 20)).toBe(140);
    expect(zebraAlignOffsetDots(100, 400, "R", 20)).toBe(300);
    expect(zebraAlignOffsetDots(100, 400, "L", 20)).toBe(0);
  });

  it("clamps to 0 when the line is wider than the block (no negative offsets)", () => {
    expect(zebraAlignOffsetDots(500, 400, "C")).toBe(0);
    expect(zebraAlignOffsetDots(500, 400, "R")).toBe(0);
  });
});

describe("blockLineStepDots", () => {
  it("adds extra inter-line spacing onto fontHeight", () => {
    expect(blockLineStepDots(30, 0)).toBe(30);
    expect(blockLineStepDots(30, 5)).toBe(35);
  });
});

describe("zebraJustifyGapDots", () => {
  it("returns extra/gapCount for non-last lines with multiple words", () => {
    expect(zebraJustifyGapDots(200, 400, 3, false)).toBe(200 / 3);
  });
  it("returns 0 on the last line (spec: J leaves last line left)", () => {
    expect(zebraJustifyGapDots(200, 400, 3, true)).toBe(0);
  });
  it("returns 0 when the line has no word gaps", () => {
    expect(zebraJustifyGapDots(200, 400, 0, false)).toBe(0);
  });
  it("returns 0 when the line already overflows the block", () => {
    expect(zebraJustifyGapDots(500, 400, 3, false)).toBe(0);
  });
});

describe("zebraHangingIndentOffsetDots", () => {
  it("returns 0 on line 1 (no indent for first line)", () => {
    expect(zebraHangingIndentOffsetDots(0, 40)).toBe(0);
  });
  it("returns the indent on lines 2+", () => {
    expect(zebraHangingIndentOffsetDots(1, 40)).toBe(40);
    expect(zebraHangingIndentOffsetDots(5, 40)).toBe(40);
  });
  it("returns 0 when indent is 0 regardless of line index", () => {
    expect(zebraHangingIndentOffsetDots(3, 0)).toBe(0);
  });
});

describe("isBlockTooNarrow", () => {
  it("returns true when block is below explicit fontWidth (Labelary fixture 02)", () => {
    expect(isBlockTooNarrow(20, 30, 30)).toBe(true);
  });
  it("returns false when block matches explicit fontWidth", () => {
    expect(isBlockTooNarrow(30, 30, 30)).toBe(false);
  });
  it("uses A0 5/9 aspect for fontWidth=0 (~17 dots for h=30)", () => {
    expect(isBlockTooNarrow(15, 30, 0)).toBe(true);
    expect(isBlockTooNarrow(20, 30, 0)).toBe(false);
  });
  it("returns false when blockWidth is 0 or absent (no block configured)", () => {
    expect(isBlockTooNarrow(0, 30, 30)).toBe(false);
  });
});

describe("blockLineStartDots: empirical line stacking per rotation", () => {
  // Empirically verified against tmp/fb_line_stacking/ (2026-06-06):
  // N: Line0 top, Line2 bottom (stack +y)
  // R: Line0 rightmost, Line2 leftmost (stack -x)
  // I: Line0 bottom, Line2 top (stack -y)
  // B: Line0 leftmost, Line2 rightmost (stack +x)
  const STEP = 35;

  it("N stacks down (+y) with perpendicular = +x", () => {
    expect(blockLineStartDots(0, "N", 10, STEP)).toEqual({ x: 10, y: 0 });
    expect(blockLineStartDots(2, "N", 10, STEP)).toEqual({ x: 10, y: 70 });
  });
  it("R stacks right→left (-x) with perpendicular = +y", () => {
    expect(blockLineStartDots(0, "R", 10, STEP)).toEqual({ x: 0, y: 10 });
    expect(blockLineStartDots(2, "R", 10, STEP)).toEqual({ x: -70, y: 10 });
  });
  it("I stacks bottom→top (-y) with perpendicular = -x", () => {
    expect(blockLineStartDots(0, "I", 10, STEP)).toEqual({ x: -10, y: 0 });
    expect(blockLineStartDots(2, "I", 10, STEP)).toEqual({ x: -10, y: -70 });
  });
  it("B stacks left→right (+x) with perpendicular = -y", () => {
    expect(blockLineStartDots(0, "B", 10, STEP)).toEqual({ x: 0, y: -10 });
    expect(blockLineStartDots(2, "B", 10, STEP)).toEqual({ x: 70, y: -10 });
  });
  it("returns (0,0) for line 0 with no perpendicular offset", () => {
    for (const rot of ["N", "R", "I", "B"] as const) {
      expect(blockLineStartDots(0, rot, 0, STEP)).toEqual({ x: 0, y: 0 });
    }
  });
});

describe("blockWordAdvanceDots: justify=J word advance axis per rotation", () => {
  it("N advances in +x (right)", () => {
    expect(blockWordAdvanceDots("N", 40)).toEqual({ dx: 40, dy: 0 });
  });
  it("R advances in +y (down along rotated reading)", () => {
    expect(blockWordAdvanceDots("R", 40)).toEqual({ dx: 0, dy: 40 });
  });
  it("I advances in -x (left, inverted)", () => {
    expect(blockWordAdvanceDots("I", 40)).toEqual({ dx: -40, dy: 0 });
  });
  it("B advances in -y (up)", () => {
    expect(blockWordAdvanceDots("B", 40)).toEqual({ dx: 0, dy: -40 });
  });
});

describe("blockJustifyWordPositions", () => {
  const COMMON = { fontHeight: 30, fontWidth: 30, extraGapDots: 20 };

  it("N: advances words along +x with extra gap added per gap", () => {
    const r = blockJustifyWordPositions({
      ...COMMON, words: ["AB", "CD"], rotation: "N", startDots: { x: 0, y: 0 },
    });
    expect(r[0]).toEqual({ x: 0, y: 0, text: "AB" });
    // AB = 2*30 dots, + spaceAdvance (30) + extraGap (20) = 110
    expect(r[1]).toEqual({ x: 110, y: 0, text: "CD" });
  });

  it("uses the spaceWidthDots override instead of the uniform cell", () => {
    const r = blockJustifyWordPositions({
      ...COMMON, words: ["AB", "CD"], rotation: "N", startDots: { x: 0, y: 0 },
      spaceWidthDots: 10,
    });
    // AB = 2*30 + space override (10) + extraGap (20) = 90
    expect(r[1]).toEqual({ x: 90, y: 0, text: "CD" });
  });

  it("R: advances words along +y", () => {
    const r = blockJustifyWordPositions({
      ...COMMON, words: ["AB", "CD"], rotation: "R", startDots: { x: 0, y: 0 },
    });
    expect(r[1]).toEqual({ x: 0, y: 110, text: "CD" });
  });

  it("I: advances words along -x (inverted)", () => {
    const r = blockJustifyWordPositions({
      ...COMMON, words: ["AB", "CD"], rotation: "I", startDots: { x: 0, y: 0 },
    });
    expect(r[1]).toEqual({ x: -110, y: 0, text: "CD" });
  });

  it("B: advances words along -y (rotated 270)", () => {
    const r = blockJustifyWordPositions({
      ...COMMON, words: ["AB", "CD"], rotation: "B", startDots: { x: 0, y: 0 },
    });
    expect(r[1]).toEqual({ x: 0, y: -110, text: "CD" });
  });

  it("accumulates cursor across 3+ words", () => {
    const r = blockJustifyWordPositions({
      ...COMMON, words: ["A", "B", "C"], rotation: "N", startDots: { x: 0, y: 0 },
    });
    // each step: word width 30 + space 30 + gap 20 = 80
    expect(r.map((p) => p.x)).toEqual([0, 80, 160]);
  });

  it("returns empty array for empty words list", () => {
    expect(blockJustifyWordPositions({
      ...COMMON, words: [], rotation: "N", startDots: { x: 0, y: 0 },
    })).toEqual([]);
  });

  it("preserves startDots offset", () => {
    const r = blockJustifyWordPositions({
      ...COMMON, words: ["A"], rotation: "N", startDots: { x: 5, y: 7 },
    });
    expect(r[0]).toEqual({ x: 5, y: 7, text: "A" });
  });
});

describe("blockBoundsDots", () => {
  // blockWidth=200, 3 lines, h=30, spacing=5 → linesExtent = 2*35+30 = 100.
  const ROT_ARGS = { blockWidthDots: 200, blockLines: 3, blockLineSpacing: 5, fontHeight: 30 };

  it("N: axis-aligned (0,0,w,h)", () => {
    expect(blockBoundsDots({ ...ROT_ARGS, rotation: "N" })).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });
  it("R: shifts left by linesExtent, swaps w/h (lines stack -x)", () => {
    expect(blockBoundsDots({ ...ROT_ARGS, rotation: "R" })).toEqual({ x: -100, y: 0, width: 100, height: 200 });
  });
  it("I: shifts up-left (lines stack -y)", () => {
    expect(blockBoundsDots({ ...ROT_ARGS, rotation: "I" })).toEqual({ x: -200, y: -100, width: 200, height: 100 });
  });
  it("B: shifts up, swaps w/h (lines stack +x)", () => {
    expect(blockBoundsDots({ ...ROT_ARGS, rotation: "B" })).toEqual({ x: 0, y: -200, width: 100, height: 200 });
  });
  it("defaults to N when rotation is omitted (backwards compat)", () => {
    expect(blockBoundsDots(ROT_ARGS)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it("anchors at (0, 0) — left edge stays at the FO position regardless of text justify", () => {
    // No justify/text parameter exists on the helper signature, so
    // C/R-justified text can never shift this bbox rightwards.
    // Adding such a parameter would be the regression to catch.
    const r = blockBoundsDots({
      blockWidthDots: 400,
      blockLines: 3,
      blockLineSpacing: 0,
      fontHeight: 30,
    });
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it("width = blockWidthDots", () => {
    const r = blockBoundsDots({
      blockWidthDots: 400,
      blockLines: 1,
      blockLineSpacing: 0,
      fontHeight: 30,
    });
    expect(r.width).toBe(400);
  });

  it("height = blockLines × fontHeight when blockLineSpacing is 0", () => {
    const r = blockBoundsDots({
      blockWidthDots: 100,
      blockLines: 3,
      blockLineSpacing: 0,
      fontHeight: 30,
    });
    expect(r.height).toBe(90);
  });

  it("blockLineSpacing fills only the N-1 inter-line gaps", () => {
    const r = blockBoundsDots({
      blockWidthDots: 100,
      blockLines: 3,
      blockLineSpacing: 5,
      fontHeight: 30,
    });
    // Matches the ZPL emit formula `fontHeight*lines + spacing*(lines-1)`
    // so the canvas wrap guide doesn't overshoot the printed block.
    expect(r.height).toBe(100); // 3 × 30 + 2 × 5
  });

  it("single-line block ignores spacing entirely (no inter-line gaps exist)", () => {
    const r = blockBoundsDots({
      blockWidthDots: 100,
      blockLines: 1,
      blockLineSpacing: 99,
      fontHeight: 30,
    });
    expect(r.height).toBe(30);
  });

  it("zero lines collapse to height 0 without underflow", () => {
    const r = blockBoundsDots({
      blockWidthDots: 100,
      blockLines: 0,
      blockLineSpacing: 5,
      fontHeight: 30,
    });
    expect(r.height).toBe(0);
  });
});

describe("blockReflowGeometry", () => {
  // scale=1, dpmm=1 keeps px == dots so the pin math is easy to read.
  // Start bbox edges: left 50, top 20, right 150, bottom 60.
  const BASE = {
    blockWidthDots: 100,
    blockLines: 1,
    blockLineSpacing: 0,
    fontHeight: 30,
    leftX: 50,
    topY: 20,
    rightX: 150,
    bottomY: 60,
    scale: 1,
    dpmm: 1,
    objectsOffsetX: 0,
    labelOffsetY: 0,
  };

  it("N drag right edge: grows blockWidth, pins the left edge", () => {
    const g = blockReflowGeometry({
      ...BASE, rotation: "N", scaleX: 2, scaleY: 1,
      activeLeft: false, activeTop: false,
    });
    expect(g.blockWidthDots).toBe(200);
    expect(g.blockLines).toBe(1);
    expect(g.targetXPx).toBe(50); // left edge stays put
    expect(g.modelXDots).toBe(50);
  });

  it("N drag left edge: pins the right edge (box left walks negative)", () => {
    const g = blockReflowGeometry({
      ...BASE, rotation: "N", scaleX: 2, scaleY: 1,
      activeLeft: true, activeTop: false,
    });
    // width 200, right edge held at 150 → left = 150 - 200 = -50.
    expect(g.targetXPx).toBe(-50);
  });

  it("N drag bottom edge: grows blockLines, pins the top edge", () => {
    const g = blockReflowGeometry({
      ...BASE, rotation: "N", scaleX: 1, scaleY: 3,
      activeLeft: false, activeTop: false,
    });
    expect(g.blockLines).toBe(3);
    expect(g.targetYPx).toBe(20);
  });

  it("R swaps the scale axes: screen-Y scale drives blockWidth, screen-X drives blockLines", () => {
    const g = blockReflowGeometry({
      ...BASE, rotation: "R", scaleX: 2, scaleY: 3,
      activeLeft: false, activeTop: false,
    });
    expect(g.blockWidthDots).toBe(300); // scaleY
    expect(g.blockLines).toBe(2); // scaleX
  });

  it("clamps blockWidth / blockLines to a minimum of 1", () => {
    const g = blockReflowGeometry({
      ...BASE, rotation: "N", scaleX: 0.001, scaleY: 0.001,
      activeLeft: false, activeTop: false,
    });
    expect(g.blockWidthDots).toBe(1);
    expect(g.blockLines).toBe(1);
  });
});
