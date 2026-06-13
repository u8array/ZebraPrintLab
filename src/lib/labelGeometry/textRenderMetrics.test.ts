import { describe, it, expect } from "vitest";
import { getTextRenderMetrics } from "./textRenderMetrics";
import type { LabelObject } from "../../types/Group";
import type { LabelConfig } from "../../types/LabelConfig";

const textObj = (fontId?: string): LabelObject =>
  ({
    id: "t1",
    type: "text",
    x: 0,
    y: 0,
    props: { content: "Abc", fontHeight: 30, fontWidth: 0, rotation: "N", fontId },
  }) as unknown as LabelObject;

const label = (over: Partial<LabelConfig> = {}): LabelConfig => ({
  widthMm: 100,
  heightMm: 60,
  dpmm: 8,
  ...over,
});

describe("getTextRenderMetrics — device font resolution", () => {
  it("renders an un-fonted field as the device default (A) on canvas", () => {
    const m = getTextRenderMetrics(textObj(), undefined, label({ defaultFontId: "A" }));
    // device path: bitmap size is set and the substitute mono face wins.
    expect(m!.fontSizeDots).toBeDefined();
    expect(m!.fontFamily).toContain("PrintLab Mono");
  });

  it("lets a custom upload aliased to the DEFAULT id win over the substitute", () => {
    // Regression: the device gate keyed on the field id only, so a custom font
    // aliased to the default font id was overridden by the built-in substitute.
    const m = getTextRenderMetrics(
      textObj(),
      undefined,
      label({
        defaultFontId: "A",
        customFonts: [{ alias: "A", previewFontName: "MyUpload" }],
      }),
    );
    expect(m!.fontSizeDots).toBeUndefined(); // scalable path, not device
    expect(m!.fontFamily).not.toContain("monospace"); // substitute face not applied
  });

  it("omits device metrics entirely on the emit/parse path (no label)", () => {
    const m = getTextRenderMetrics(textObj("A"));
    expect(m!.fontSizeDots).toBeUndefined();
    expect(m!.letterSpacingDots).toBeUndefined();
  });
});
