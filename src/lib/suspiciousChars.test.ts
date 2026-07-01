import { describe, it, expect } from "vitest";
import { suspiciousCharDetail } from "./suspiciousChars";

const CH = (cp: number) => String.fromCharCode(cp);
const NBSP = CH(0xa0);

describe("suspiciousCharDetail", () => {
  it("returns undefined for clean content", () => {
    expect(suspiciousCharDetail("01042601194549961726013110FM230326")).toBeUndefined();
  });

  it("ignores legitimate whitespace (space, tab, newline, CR)", () => {
    expect(suspiciousCharDetail("a b\tc\nd\re")).toBeUndefined();
  });

  it("ignores the soft hyphen used by ^FB", () => {
    expect(suspiciousCharDetail("soft" + CH(0x00ad) + "hyphen")).toBeUndefined();
  });

  it("names a single NBSP", () => {
    expect(suspiciousCharDetail("A" + NBSP + "B")).toBe("NBSP x1");
  });

  it("counts repeated NBSP (the scanned-DataMatrix case)", () => {
    const content = "01042601194549961726013110FM230326" + NBSP.repeat(31);
    expect(suspiciousCharDetail(content)).toBe("NBSP x31");
  });

  it("counts NBSP but not the plain spaces mixed with it", () => {
    // 3 NBSP interleaved with regular spaces -> only the NBSP are suspicious.
    expect(suspiciousCharDetail(NBSP + " " + NBSP + " " + NBSP)).toBe("NBSP x3");
  });

  it("names zero-width and BOM chars", () => {
    expect(suspiciousCharDetail("a" + CH(0x200b) + "b")).toBe("ZWSP x1");
    expect(suspiciousCharDetail(CH(0xfeff) + "x")).toBe("BOM x1");
  });

  it("reports control chars by code point", () => {
    expect(suspiciousCharDetail("a" + CH(0x01) + "b")).toBe("U+0001 x1");
  });

  it("reports DEL and C1 control chars", () => {
    expect(suspiciousCharDetail("a" + CH(0x7f) + "b")).toBe("U+007F x1");
    expect(suspiciousCharDetail("a" + CH(0x9f) + "b")).toBe("U+009F x1");
  });

  it("flags invisible bidi direction marks (LRM/RLM/isolates)", () => {
    expect(suspiciousCharDetail("12" + CH(0x200e) + "34")).toBe("U+200E x1");
    expect(suspiciousCharDetail("12" + CH(0x200f) + "34")).toBe("U+200F x1");
    expect(suspiciousCharDetail(CH(0x2066) + "x" + CH(0x2069))).toBe("U+2066 x1, U+2069 x1");
  });

  it("lists multiple distinct kinds, comma-joined", () => {
    expect(suspiciousCharDetail("a" + NBSP + CH(0x2028) + "b")).toBe("NBSP x1, U+2028 x1");
  });
});
