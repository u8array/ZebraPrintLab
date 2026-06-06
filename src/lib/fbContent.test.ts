import { describe, it, expect } from "vitest";
import { encodeFbContent, decodeFbContent } from "./fbContent";

describe("fbContent encode/decode", () => {
  it("encodes newlines as \\&", () => {
    expect(encodeFbContent("line1\nline2")).toBe("line1\\&line2");
  });

  it("escapes literal backslash so \\& payloads round-trip", () => {
    expect(encodeFbContent("a\\&b")).toBe("a\\\\&b");
    expect(decodeFbContent("a\\\\&b")).toBe("a\\&b");
  });

  it("decode is symmetric with encode", () => {
    const samples = [
      "",
      "plain",
      "two\nlines",
      "back\\slash",
      "literal\\&marker",
      "mixed\n\\&\nback\\slash",
      "trailing\\",
    ];
    for (const s of samples) {
      expect(decodeFbContent(encodeFbContent(s))).toBe(s);
    }
  });

  it("passes unknown escapes through unchanged (legacy payloads)", () => {
    expect(decodeFbContent("a\\xb")).toBe("a\\xb");
  });

  it("decodes \\- as soft hyphen (U+00AD) and re-encodes symmetrically", () => {
    const soft = "­";
    expect(decodeFbContent("docu\\-ment")).toBe(`docu${soft}ment`);
    expect(encodeFbContent(`docu${soft}ment`)).toBe("docu\\-ment");
    expect(decodeFbContent(encodeFbContent(`docu${soft}ment`))).toBe(`docu${soft}ment`);
  });

  it("decodes legacy unescaped \\& to newline (pre-backslash-escape format)", () => {
    // Payloads written before the encoder learned to escape `\` still
    // emitted bare `\&` for newlines. Decoder must keep handling that
    // so existing saved labels round-trip unchanged.
    expect(decodeFbContent("line1\\&line2")).toBe("line1\nline2");
  });
});
