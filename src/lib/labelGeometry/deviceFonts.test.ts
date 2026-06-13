import { describe, it, expect } from "vitest";
import { applyDeviceFontCase, deviceFontMetrics } from "./deviceFonts";
import { ZPL_BUILTIN_FONT_LETTERS, builtinFontFamily } from "../customFonts";

describe("device-font table parity", () => {
  // Metrics table and canvas-face map are keyed independently; a font in one
  // but not the other would render at the wrong size or in the wrong face.
  const deviceLetters = ZPL_BUILTIN_FONT_LETTERS.split("").filter(
    (c) => c !== "0",
  );

  it.each(deviceLetters)("font %s has both metrics and a canvas face", (id) => {
    expect(deviceFontMetrics(id, 30, 0)).not.toBeNull();
    expect(builtinFontFamily(id)).toBeDefined();
  });

  it("scalable Font 0 has neither device metrics nor a face", () => {
    expect(deviceFontMetrics("0", 30, 0)).toBeNull();
    expect(builtinFontFamily("0")).toBeUndefined();
  });
});

describe("applyDeviceFontCase", () => {
  it("uppercases Font B (no lowercase glyphs)", () => {
    expect(applyDeviceFontCase("B", "Text123")).toBe("TEXT123");
  });

  it("drops lowercase for Font H (OCR-A)", () => {
    expect(applyDeviceFontCase("H", "Text123")).toBe("T123");
  });

  it("leaves other fonts and «markers» untouched", () => {
    expect(applyDeviceFontCase("A", "Text")).toBe("Text");
    expect(applyDeviceFontCase("B", "ab«name»cd")).toBe("AB«name»CD");
    expect(applyDeviceFontCase("H", "ab«name»cd")).toBe("«name»");
  });

  it("keeps the serial '#' prefix through case folding", () => {
    // serial fields render content as `#${value}`; the prefix must survive
    // both case modes so the canvas preview keeps the serial marker.
    expect(applyDeviceFontCase("H", "#abc123")).toBe("#123");
    expect(applyDeviceFontCase("B", "#abc")).toBe("#ABC");
  });
});

describe("deviceFontMetrics", () => {
  it("returns null for the scalable Font 0 and unknown / empty ids", () => {
    expect(deviceFontMetrics("0", 30, 0)).toBeNull();
    expect(deviceFontMetrics("Z", 30, 0)).toBeNull();
    expect(deviceFontMetrics(undefined, 30, 0)).toBeNull();
  });

  it("produces a positive size and scale for a device font", () => {
    const m = deviceFontMetrics("A", 18, 0);
    expect(m).not.toBeNull();
    expect(m!.fontSizeDots).toBeGreaterThan(0);
    expect(m!.scaleX).toBeGreaterThan(0);
  });

  it("scales the calibrated position offset with the font size", () => {
    // Font A carries a vertical trim; it must grow with fontSizeDots.
    const small = deviceFontMetrics("A", 18, 0)!;
    const big = deviceFontMetrics("A", 90, 0)!;
    expect(small.yOffsetDots).toBeGreaterThan(0);
    expect(big.yOffsetDots).toBeGreaterThan(small.yOffsetDots);
    // A font without a configured vertical offset stays at zero.
    expect(deviceFontMetrics("B", 88, 0)!.yOffsetDots).toBe(0);
  });

  it("snaps nearby heights to the same magnification (quantization)", () => {
    // Font A cell height 9: round(14/9)=2 and round(18/9)=2 -> same magnification.
    expect(deviceFontMetrics("A", 14, 0)).toEqual(deviceFontMetrics("A", 18, 0));
    // round(13/9)=1 is a lower magnification -> smaller size.
    expect(deviceFontMetrics("A", 13, 0)!.fontSizeDots).toBeLessThan(
      deviceFontMetrics("A", 18, 0)!.fontSizeDots,
    );
  });

  it("clamps magnification to at least 1", () => {
    const tiny = deviceFontMetrics("G", 1, 0); // cell 60, round(1/60)=0 -> clamp 1
    expect(tiny!.fontSizeDots).toBeGreaterThan(0);
  });

  it("clamps magnification to MAX_MAG (10) at the top", () => {
    // Font A cell 9: a height far past 10x snaps to the same size as exactly 10x.
    const atCap = deviceFontMetrics("A", 9 * 10, 0)!;
    const wayOver = deviceFontMetrics("A", 9 * 50, 0)!;
    expect(wayOver.fontSizeDots).toBe(atCap.fontSizeDots);
  });

  it("returns null for NaN / zero / negative height", () => {
    expect(deviceFontMetrics("A", 0, 0)).toBeNull();
    expect(deviceFontMetrics("A", -5, 0)).toBeNull();
    expect(deviceFontMetrics("A", NaN, 0)).toBeNull();
  });

  it("applies a positive letter-spacing for fonts that loosen the advance", () => {
    // Font A carries letterSpacingEm 0.021; the rendered spacing must stay
    // positive and scale with the size (guards the sign of the conversion).
    const m = deviceFontMetrics("A", 90, 0)!;
    expect(m.letterSpacingDots).toBeGreaterThan(0);
    // Font C has no letterSpacingEm -> exactly zero.
    expect(deviceFontMetrics("C", 36, 0)!.letterSpacingDots).toBe(0);
  });

  it("widens the horizontal scale when an explicit width is larger", () => {
    const narrow = deviceFontMetrics("A", 18, 0)!;
    const wide = deviceFontMetrics("A", 18, 20)!;
    expect(wide.scaleX).toBeGreaterThan(narrow.scaleX);
    expect(wide.fontSizeDots).toBe(narrow.fontSizeDots); // height unchanged
  });
});
