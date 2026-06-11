import { describe, it, expect } from "vitest";
import {
  eanUpcHriFontFamily,
  upcSuppAboveGapDots,
  upcSuppTextZoneDots,
} from "./bwipConstants";

// Labelary uses Font A (Vera) for small EAN/UPC HRI and OCR-B from mw 3 up.
describe("eanUpcHriFontFamily", () => {
  it("uses Vera (Font A) at module width 1-2", () => {
    expect(eanUpcHriFontFamily(1)).toContain("Vera Mono");
    expect(eanUpcHriFontFamily(2)).toContain("Vera Mono");
    expect(eanUpcHriFontFamily(2)).not.toContain("OCRB");
  });
  it("switches to OCR-B at module width 3 and above", () => {
    for (const mw of [3, 5, 10]) expect(eanUpcHriFontFamily(mw)).toContain("OCRB");
  });
});

// Regression guard for the ^BS supplement bbox text-zone and above-gap.
// Measured against Labelary at 8 dpmm with ^BSN,80,Y ^FD51999 across
// moduleWidth 1-10; the reserved ink-cap-height + gap follows Zebra Font 0
// discrete magnification steps (mag 1/2/3/6) rather than scaling linearly.
describe("^BS supplement HRI sizing", () => {
  const cases: { mw: number; gap: number; zone: number }[] = [
    { mw: 1, gap: 2, zone: 9 },
    { mw: 2, gap: 4, zone: 18 },
    { mw: 3, gap: 3, zone: 24 },
    { mw: 5, gap: 3, zone: 24 },
    { mw: 7, gap: 3, zone: 24 },
    { mw: 8, gap: 5, zone: 49 },
    { mw: 10, gap: 5, zone: 49 },
  ];
  for (const { mw, gap, zone } of cases) {
    it(`mw=${mw} -> gap ${gap}, zone ${zone}`, () => {
      expect(upcSuppAboveGapDots(mw)).toBe(gap);
      expect(upcSuppTextZoneDots(mw)).toBe(zone);
    });
  }
});
