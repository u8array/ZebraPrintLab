import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildBwipOptions, getDisplaySize, getEanUpcLayout } from "./bwipHelpers";
import type { LabelObject } from "../../registry";

describe("getEanUpcLayout", () => {
  // bwip-js native canvas widths (no quiet zones, scale=2):
  //   ean13/upca: 95 modules → 190 px
  //   ean8:       67 modules → 134 px
  //   upce:       51 modules → 102 px

  describe("EAN-13", () => {
    it("places left block after start guard at module 3", () => {
      // 1 module = 1 displayPx → modulePx = 1
      const l = getEanUpcLayout("ean13", 95, 190, 2);
      expect(l.modulePx).toBe(1);
      expect(l.xLeft).toBe(3);
      expect(l.xRight).toBe(50);
      expect(l.halfWidth).toBe(42);
    });

    it("scales positions with display width", () => {
      // 95 modules rendered at 380 displayPx → modulePx = 4
      const l = getEanUpcLayout("ean13", 380, 190, 2);
      expect(l.modulePx).toBe(4);
      expect(l.xLeft).toBe(12);
      expect(l.xRight).toBe(200);
      expect(l.halfWidth).toBe(168);
    });

    it("works at bwipScale=1 (the case that broke the original code)", () => {
      // At low zoom: bwip canvas = 95 modules × 1 = 95 px.
      // The pre-fix code assumed BWIP_SCALE=2, computing qL13 = 95/2 - 102 = -54.5.
      const l = getEanUpcLayout("ean13", 95, 95, 1);
      expect(l.modulePx).toBe(1);
      expect(l.xLeft).toBe(3);
      expect(l.xRight).toBe(50);
    });
  });

  describe("EAN-8", () => {
    it("places blocks after 3-module start guard and 5-module centre guard", () => {
      const l = getEanUpcLayout("ean8", 67, 134, 2);
      expect(l.modulePx).toBe(1);
      expect(l.xLeft).toBe(3); // after start guard
      expect(l.xRight).toBe(36); // 3 + 28 + 5
      expect(l.halfWidth).toBe(28);
    });
  });

  describe("UPC-A", () => {
    it("offsets left block to skip system digit's bars (module 10)", () => {
      // UPC-A bar pattern is EAN-13; system digit occupies modules 3-9 (encoded
      // but rendered outside-left visually). Visible digits start at module 10.
      const l = getEanUpcLayout("upca", 95, 190, 2);
      expect(l.modulePx).toBe(1);
      expect(l.xLeft).toBe(10);
      expect(l.xRight).toBe(50);
      expect(l.halfWidth).toBe(35); // 5 visible digits × 7 modules
    });
  });

  describe("UPC-E", () => {
    it("places single block at module 3 spanning 42 modules", () => {
      const l = getEanUpcLayout("upce", 51, 102, 2);
      expect(l.modulePx).toBe(1);
      expect(l.xLeft).toBe(3);
      expect(l.halfWidth).toBe(42);
    });
  });
});

describe("rotation pipeline", () => {
  // Minimal code128 fixture; only the props used by buildBwipOptions/
  // getDisplaySize matter for these checks.
  const baseCode128 = (rotation: "N" | "R" | "I" | "B"): LabelObject =>
    ({
      id: "1",
      type: "code128",
      x: 0,
      y: 0,
      rotation: 0,
      props: {
        content: "ABC",
        height: 100,
        moduleWidth: 2,
        printInterpretation: false,
        checkDigit: false,
        rotation,
      },
    }) as LabelObject;

  it("does not set rotate for N", () => {
    const opts = buildBwipOptions(baseCode128("N"), 1, 8);
    expect(opts?.rotate).toBeUndefined();
  });

  it("forwards R and I unchanged to bwip-js", () => {
    expect(buildBwipOptions(baseCode128("R"), 1, 8)?.rotate).toBe("R");
    expect(buildBwipOptions(baseCode128("I"), 1, 8)?.rotate).toBe("I");
  });

  it("translates ZPL B to bwip L (270° CW)", () => {
    expect(buildBwipOptions(baseCode128("B"), 1, 8)?.rotate).toBe("L");
  });

  it("swaps display W and H for quarter rotations", () => {
    // Pretend bwip produced an unrotated 200x100 bitmap.
    const fakeCanvas = { width: 200, height: 100 } as HTMLCanvasElement;
    const upright = getDisplaySize(baseCode128("N"), fakeCanvas, 1, 8);
    // For R/B, bwip's bitmap is post-rotation (100x200). Pass that and check
    // the upright dimensions are recovered then re-swapped to visible.
    const rotatedCanvas = { width: 100, height: 200 } as HTMLCanvasElement;
    const rotR = getDisplaySize(baseCode128("R"), rotatedCanvas, 1, 8);
    const rotB = getDisplaySize(baseCode128("B"), rotatedCanvas, 1, 8);
    expect(rotR.w).toBe(upright.h);
    expect(rotR.h).toBe(upright.w);
    expect(rotB.w).toBe(upright.h);
    expect(rotB.h).toBe(upright.w);
  });

  it("leaves dimensions untouched for I (180°)", () => {
    const fakeCanvas = { width: 200, height: 100 } as HTMLCanvasElement;
    const upright = getDisplaySize(baseCode128("N"), fakeCanvas, 1, 8);
    const inverted = getDisplaySize(baseCode128("I"), fakeCanvas, 1, 8);
    expect(inverted).toEqual(upright);
  });
});

describe("getDisplaySize gs1databar sym 7 fallback", () => {
  // Sym 7 (Expanded Stacked) cannot be Labelary-cross-validated due to a
  // parens-AI input-format mismatch between bwip-js and Zebra firmware.
  // The implementation falls back to bwip-natural canvas height. This test
  // pins that behavior — any change must be intentional and accompanied
  // by a documented strategy for the missing ground truth.
  it("derives height from canvas dims (bwip-natural), not from a spec table", () => {
    const obj: LabelObject = {
      id: "1",
      type: "gs1databar",
      x: 0,
      y: 0,
      rotation: 0,
      props: {
        content: "0112345678901231",
        moduleWidth: 2,
        symbology: 7,
        segments: 22,
        rotation: "N",
      },
    };
    // Canvas height varies per content+segments; we use a representative
    // value that bwip-js produced for a 16-char content at default
    // segments. The exact pixel size isn't load-bearing — what matters is
    // the formula, which derives from `ch`.
    const ch = 73;
    const cw = 100;
    const fakeCanvas = { width: cw, height: ch } as HTMLCanvasElement;
    const result = getDisplaySize(obj, fakeCanvas, 1, 8);
    // bwipSc = max(1, round(dotsToPx(2, 1, 8))) = round(0.25) = 1; modulePx = 0.25
    // h = (ch / 1) * 0.25 = 18.25
    expect(result.h).toBeCloseTo(18.25, 2);
  });
});

describe("buildBwipOptions gs1databar Expanded fallback", () => {
  // AI 01 + 11 numeric digits is not a valid GTIN-14 element string. Zebra
  // firmware emits General Compaction (~149 modules) rather than Method 1
  // padding. We route bwip-js through `(99)` so the rendered width matches.
  const obj = (content: string): LabelObject => ({
    id: "1",
    type: "gs1databar",
    x: 0,
    y: 0,
    rotation: 0,
    props: {
      content,
      moduleWidth: 2,
      symbology: 6,
      segments: 22,
      rotation: "N",
    },
  });

  it("re-routes AI 01 + 11-digit fragment through (99) wrap", () => {
    const opts = buildBwipOptions(obj("0112345678901"), 1, 8);
    expect(opts?.text).toBe("(99)0112345678901");
  });

  it("keeps valid AI 01 GTIN-14 input on the standard wrap path", () => {
    const opts = buildBwipOptions(obj("0112345678901231"), 1, 8);
    expect(opts?.text).toBe("(01)12345678901231");
  });
});

describe("getDisplaySize coverage (ZPL-first policy)", () => {
  // Static parse of bwipHelpers.ts: every barcode type registered via BCID
  // must have an explicit `case "type":` in getUprightDisplaySize, otherwise
  // the default fallback returns bwip-natural pixels and silently violates
  // the ZPL-first sizing policy.
  it("every BCID-registered type has an explicit case (no silent default)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "bwipHelpers.ts"), "utf-8");

    const bcidBlock = /const BCID:[^=]*=\s*\{([\s\S]*?)\};/.exec(src);
    expect(bcidBlock, "BCID literal not found in source").toBeTruthy();
    const bcidKeys = [...(bcidBlock?.[1] ?? "").matchAll(/^\s*(\w+):\s*"/gm)]
      .map((m) => m[1] ?? "");

    const fnBlock = /function getUprightDisplaySize\([\s\S]*?^\}/m.exec(src);
    expect(fnBlock, "getUprightDisplaySize body not found").toBeTruthy();
    const caseLabels = [...(fnBlock?.[0] ?? "").matchAll(/case "(\w+)":/g)]
      .map((m) => m[1] ?? "");

    const missing = bcidKeys.filter((k) => !caseLabels.includes(k));
    expect(missing, `Missing explicit case for: ${missing.join(", ")}`).toEqual([]);
  });
});
