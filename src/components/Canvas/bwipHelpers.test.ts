import { describe, it, expect } from "vitest";
import { getEanUpcLayout } from "./bwipHelpers";

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
