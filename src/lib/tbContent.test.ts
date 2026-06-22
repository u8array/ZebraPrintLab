import { describe, it, expect } from "vitest";
import { encodeTbContent, decodeTbContent } from "./tbContent";

describe("tbContent encode/decode", () => {
  it("escapes a literal < as <<> (Labelary escape syntax)", () => {
    expect(encodeTbContent("A<B")).toBe("A<<>B");
    expect(decodeTbContent("A<<>B")).toBe("A<B");
  });

  it("leaves > untouched (only < is special)", () => {
    expect(encodeTbContent("A>B")).toBe("A>B");
    expect(decodeTbContent("A>B")).toBe("A>B");
  });

  it("collapses newlines to a space (^TB has no hard break)", () => {
    expect(encodeTbContent("line1\nline2")).toBe("line1 line2");
  });

  it("preserves an existing <…> escape token verbatim (no re-escape)", () => {
    expect(encodeTbContent("A<2C>B")).toBe("A<2C>B");
    expect(decodeTbContent("A<2C>B")).toBe("A<2C>B");
  });

  it("round-trips an imported <…> token byte-identically", () => {
    // The round-trip a re-emit performs: decode then encode must be a no-op.
    for (const zpl of ["A<2C>B", "<FF>x", "a<>b", "<2C>"]) {
      expect(encodeTbContent(decodeTbContent(zpl))).toBe(zpl);
    }
  });

  it("decode is symmetric with encode for non-newline payloads", () => {
    const samples = ["", "plain", "less < than", "a<b<c", "trail<", ">lead"];
    for (const s of samples) {
      expect(decodeTbContent(encodeTbContent(s))).toBe(s);
    }
  });
});
