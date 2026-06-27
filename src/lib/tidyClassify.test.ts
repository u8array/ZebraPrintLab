import { describe, it, expect } from "vitest";
import { classifyForTidy, selectTidyTargets, type TidyItem } from "./tidyClassify";

const LW = 800;
const LH = 400;

describe("classifyForTidy", () => {
  it("flags a near-full-label box as frame", () => {
    expect(
      classifyForTidy("box", { x: 0, y: 0, width: 780, height: 390 }, LW, LH),
    ).toBe("frame");
  });

  it("flags an ellipse covering most of the label as frame", () => {
    expect(
      classifyForTidy("ellipse", { x: 5, y: 5, width: 700, height: 360 }, LW, LH),
    ).toBe("frame");
  });

  it("flags any line as divider", () => {
    expect(
      classifyForTidy("line", { x: 0, y: 100, width: 800, height: 2 }, LW, LH),
    ).toBe("divider");
  });

  it("flags a thin, wide box as divider", () => {
    expect(
      classifyForTidy("box", { x: 0, y: 100, width: 600, height: 4 }, LW, LH),
    ).toBe("divider");
  });

  it("flags a thin, tall box as divider", () => {
    expect(
      classifyForTidy("box", { x: 400, y: 0, width: 4, height: 300 }, LW, LH),
    ).toBe("divider");
  });

  it("keeps a normal box as content", () => {
    expect(
      classifyForTidy("box", { x: 10, y: 10, width: 100, height: 60 }, LW, LH),
    ).toBe("content");
  });

  it("keeps non-shape types as content regardless of size", () => {
    const huge = { x: 0, y: 0, width: 800, height: 400 };
    for (const t of ["text", "symbol", "image", "qrcode", "code128", "group"]) {
      expect(classifyForTidy(t, huge, LW, LH)).toBe("content");
    }
  });
});

describe("selectTidyTargets", () => {
  it("excludes a frame box and a horizontal divider line, keeps the barcodes", () => {
    const items: TidyItem[] = [
      { id: "frame", type: "box", box: { x: 0, y: 0, width: 790, height: 395 } },
      { id: "rule", type: "line", box: { x: 0, y: 200, width: 800, height: 2 } },
      { id: "bc1", type: "code128", box: { x: 20, y: 20, width: 120, height: 80 } },
      { id: "bc2", type: "qrcode", box: { x: 300, y: 20, width: 80, height: 80 } },
    ];
    expect(selectTidyTargets(items, LW, LH)).toEqual(["bc1", "bc2"]);
  });

  it("falls back to all ids when fewer than 2 content objects", () => {
    const items: TidyItem[] = [
      { id: "frame", type: "box", box: { x: 0, y: 0, width: 790, height: 395 } },
      { id: "bc1", type: "code128", box: { x: 20, y: 20, width: 120, height: 80 } },
    ];
    expect(selectTidyTargets(items, LW, LH)).toEqual(["frame", "bc1"]);
  });
});
