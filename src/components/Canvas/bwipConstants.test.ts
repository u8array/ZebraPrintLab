import { describe, it, expect } from "vitest";
import {
  upcSuppAboveGapDots,
  upcSuppFontDots,
  upcSuppTextZoneDots,
} from "./bwipConstants";

// Regression guard for the ^BS supplement HRI sizing. Measured against
// Labelary at 8 dpmm with ^BSN,80,Y ^FD51999 across moduleWidth 1-10;
// font glyph height and gap follow Zebra Font 0 in discrete magnification
// steps (mag 1/2/3/6) rather than scaling linearly with moduleWidth.
describe("^BS supplement HRI sizing", () => {
  const cases: { mw: number; font: number; gap: number }[] = [
    { mw: 1, font: 7, gap: 2 },
    { mw: 2, font: 14, gap: 4 },
    { mw: 3, font: 21, gap: 3 },
    { mw: 5, font: 21, gap: 3 },
    { mw: 7, font: 21, gap: 3 },
    { mw: 8, font: 44, gap: 5 },
    { mw: 10, font: 44, gap: 5 },
  ];
  for (const { mw, font, gap } of cases) {
    it(`mw=${mw} -> font ${font}, gap ${gap}, zone ${font + gap}`, () => {
      expect(upcSuppFontDots(mw)).toBe(font);
      expect(upcSuppAboveGapDots(mw)).toBe(gap);
      expect(upcSuppTextZoneDots(mw)).toBe(font + gap);
    });
  }
});
