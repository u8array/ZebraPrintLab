import { describe, it, expect } from "vitest";
import {
  gtin14WithCheck,
  wrapGs1AIs,
  mod10CheckDigit,
  validateGs1Segment,
  validateGs1Segments,
  elementStringToContent,
  gtinBodyFromContent,
  segmentsToElementString,
  segmentsToContent,
  parseGs1ToSegments,
  gs1ContentToElementString,
  gs1ContentToDataMatrixFd,
  dataMatrixFdToGs1Content,
  GS1_DATAMATRIX_ESCAPE,
  GS1_GS,
  GS1_DATABAR_EXPANDED_SYMBOLOGIES,
  GS1_DATABAR_DEFAULT_SEGMENTS,
} from "./gs1";

describe("gtin14WithCheck", () => {
  it("computes the check digit for a 13-digit body", () => {
    // GS1 mod-10 (weights 3-1 from the right): body 0112345678901 → check 1.
    expect(gtin14WithCheck("0112345678901")).toBe("01123456789011");
  });

  it("pads short input to 13 digits before computing check", () => {
    expect(gtin14WithCheck("12345")).toHaveLength(14);
  });

  it("returns the input unchanged when 14 digits are supplied", () => {
    expect(gtin14WithCheck("01123456789011")).toBe("01123456789011");
  });

  it("strips an AI 01 prefix when input is longer than 14 digits", () => {
    // "01" prefix + 14 digits → keep only the 14
    expect(gtin14WithCheck("0101123456789011")).toBe("01123456789011");
  });

  it("ignores non-digit characters", () => {
    expect(gtin14WithCheck("(01)12345")).toHaveLength(14);
  });
});

describe("wrapGs1AIs", () => {
  it("wraps raw AI 01 + GTIN-14 in parens", () => {
    expect(wrapGs1AIs("0112345678901231")).toBe("(01)12345678901231");
  });

  it("auto-completes the GTIN check digit when AI 01 data is short", () => {
    // 9 digits after "01" → padded to 13 + check = 14
    const out = wrapGs1AIs("01123456789");
    expect(out.startsWith("(01)")).toBe(true);
    expect(out.slice(4)).toHaveLength(14);
  });

  it("passes through already-parenthesised input unchanged", () => {
    expect(wrapGs1AIs("(01)12345678901231")).toBe("(01)12345678901231");
  });

  it("appends unknown AI data verbatim so bwip-js surfaces the error", () => {
    // AI 99 is not in the fixed-length table
    expect(wrapGs1AIs("99abcdef")).toBe("99abcdef");
  });
});

describe("mod10CheckDigit", () => {
  it("computes the GS1 mod-10 check digit", () => {
    // GTIN-14 09501101530003: body 0950110153000 → check 3 (decoder-verified).
    expect(mod10CheckDigit("0950110153000")).toBe("3");
  });
});

describe("validateGs1Segment", () => {
  it("accepts a short GTIN (auto-completed later)", () => {
    expect(validateGs1Segment("01", "12345")).toBeNull();
  });
  it("flags an over-long GTIN and non-digits", () => {
    expect(validateGs1Segment("01", "012345678901234")).toBe("tooLong");
    expect(validateGs1Segment("01", "12a45")).toBe("digitsOnly");
  });
  it("validates dates incl. DD=00", () => {
    expect(validateGs1Segment("17", "261200")).toBeNull();
    expect(validateGs1Segment("17", "261331")).toBe("dateMonth");
    expect(validateGs1Segment("17", "2612")).toBe("dateFormat");
  });
  it("enforces exact length for fixedNum and max for variable", () => {
    expect(validateGs1Segment("20", "9")).toBe("exactLength");
    expect(validateGs1Segment("20", "99")).toBeNull();
    expect(validateGs1Segment("10", "A".repeat(21))).toBe("tooLong");
    expect(validateGs1Segment("10", "ABC-123")).toBeNull();
  });

  it("validates varNum (digits only, max length) and unknown AIs", () => {
    expect(validateGs1Segment("30", "12345")).toBeNull();
    expect(validateGs1Segment("30", "12a")).toBe("digitsOnly");
    expect(validateGs1Segment("30", "123456789")).toBe("tooLong"); // max 8
    expect(validateGs1Segment("99", "x")).toBe("unknownAi");
  });

  it("verifies the check digit of a full GTIN and SSCC", () => {
    expect(validateGs1Segment("01", "09501101530003")).toBeNull();
    expect(validateGs1Segment("01", "09501101530004")).toBe("checkDigit");
    expect(validateGs1Segment("00", "000000000000000000")).toBeNull();
    expect(validateGs1Segment("00", "000000000000000001")).toBe("checkDigit");
  });

  it("rejects impossible calendar days but allows DD=00", () => {
    expect(validateGs1Segment("17", "170230")).toBe("dateDay"); // Feb 30
    expect(validateGs1Segment("17", "170229")).toBeNull(); // leap allowed
    expect(validateGs1Segment("17", "170200")).toBeNull(); // whole month
  });

  it("rejects parentheses in varAlnum (renderer can't escape them)", () => {
    expect(validateGs1Segment("10", "AB(C)")).toBe("charset");
  });
});

describe("validateGs1Segments (combination rules)", () => {
  it("requires a GTIN (01) for attribute AIs, matching bwip", () => {
    expect(validateGs1Segments([])).toBe("empty");
    expect(validateGs1Segments([{ ai: "10", value: "ABC123" }])).toBe("missingGtin");
    expect(validateGs1Segments([
      { ai: "01", value: "09501101530003" },
      { ai: "10", value: "ABC123" },
    ])).toBeNull();
  });

  it("treats SSCC (00) and GTIN (01) as standalone", () => {
    expect(validateGs1Segments([{ ai: "00", value: "000000000000000000" }])).toBeNull();
    expect(validateGs1Segments([{ ai: "01", value: "09501101530003" }])).toBeNull();
  });

  it("rejects duplicate AI codes", () => {
    expect(validateGs1Segments([
      { ai: "01", value: "09501101530003" },
      { ai: "10", value: "ABC" },
      { ai: "10", value: "DEF" },
    ])).toBe("duplicateAi");
  });
});

describe("elementStringToContent", () => {
  it("parses a pasted element string (whitespace tolerated) to raw content with GS", () => {
    expect(elementStringToContent("  (01)09501101530003(10)ABC(21)SN\n")).toBe(
      `010950110153000310ABC${GS1_GS}21SN`,
    );
  });
  it("returns null for non-element-string input", () => {
    expect(elementStringToContent("010950110153000310ABC")).toBeNull();
    expect(elementStringToContent("(01)0950(99)X")).toBeNull(); // unknown AI
  });
});

describe("gtinBodyFromContent", () => {
  it("extracts the (01) value from multi-AI content", () => {
    const content = segmentsToContent([
      { ai: "01", value: "09501101530003" },
      { ai: "10", value: "ABC123" },
    ]);
    expect(gtinBodyFromContent(content)).toBe("09501101530003");
  });
  it("falls back to the digits of unstructured content", () => {
    expect(gtinBodyFromContent("0112345678901")).toBe("0112345678901");
  });
  it("strips a leading 01 AI prefix in the unparseable fallback (no truncation)", () => {
    // 01 + 15 digits fails the parser; the GTIN must not keep the 01 prefix.
    expect(gtinBodyFromContent("01095011015300031")).toBe("09501101530003");
  });
});

describe("segments serialize/parse", () => {
  const segs = [
    { ai: "01", value: "09501101530003" },
    { ai: "10", value: "ABC123" },
    { ai: "21", value: "12345" },
  ];

  it("builds the parenthesized element string", () => {
    expect(segmentsToElementString(segs)).toBe("(01)09501101530003(10)ABC123(21)12345");
  });

  it("auto-completes a short GTIN without folding the AI into the body", () => {
    expect(segmentsToElementString([{ ai: "01", value: "12345" }])).toBe("(01)00000000123457");
    expect(segmentsToContent([{ ai: "01", value: "12345" }])).toBe("0100000000123457");
  });

  it("raw parser preserves a '(' in a value (round-trip); the validator rejects it separately", () => {
    expect(parseGs1ToSegments("10ABC(123)")).toEqual([{ ai: "10", value: "ABC(123)" }]);
  });

  it("builds raw content with a GS after a non-last variable AI only", () => {
    expect(segmentsToContent(segs)).toBe(`010950110153000310ABC123${GS1_GS}2112345`);
  });

  it("round-trips raw content back to segments (fixed + variable + mixed)", () => {
    expect(parseGs1ToSegments(segmentsToContent(segs))).toEqual(segs);
  });

  it("parses the parenthesized form", () => {
    expect(parseGs1ToSegments("(01)09501101530003(10)ABC123")).toEqual([
      { ai: "01", value: "09501101530003" },
      { ai: "10", value: "ABC123" },
    ]);
  });

  it("returns null for non-GS1 content (fallback to free text)", () => {
    expect(parseGs1ToSegments("hello world")).toBeNull();
    expect(parseGs1ToSegments("0112")).toBeNull(); // fixed AI too short
  });

  it("derives the bwip element string from raw content", () => {
    expect(gs1ContentToElementString(segmentsToContent(segs))).toBe(
      "(01)09501101530003(10)ABC123(21)12345",
    );
  });

  it("falls back to the legacy wrapper when content is not cleanly segmentable", () => {
    // AI 01 with a short body: catalog parse fails, legacy wrapper completes it.
    const out = gs1ContentToElementString("01123");
    expect(out.startsWith("(01)")).toBe(true);
    expect(out.slice(4)).toHaveLength(14);
  });
});

describe("GS1 DataMatrix field data", () => {
  // (01)09501101530003(10)ABC123(21)12345 in raw model form (GS after the
  // non-last variable AI 10).
  const content = `010950110153000310ABC123${GS1_GS}2112345`;
  const fd = "_1010950110153000310ABC123_12112345";

  it("encodes a leading FNC1 and turns each GS into the escape sequence", () => {
    expect(gs1ContentToDataMatrixFd(content)).toBe(fd);
    expect(GS1_DATAMATRIX_ESCAPE).toBe("_");
  });

  it("round-trips through the inverse", () => {
    expect(dataMatrixFdToGs1Content(fd, GS1_DATAMATRIX_ESCAPE)).toBe(content);
  });

  it("returns null when field data has no leading FNC1 (non-GS1)", () => {
    expect(dataMatrixFdToGs1Content("1234567890", "_")).toBeNull();
  });

  it("strips a trailing GS so no dangling FNC1 is emitted", () => {
    expect(gs1ContentToDataMatrixFd(`0109501101530003${GS1_GS}`)).toBe("_10109501101530003");
  });

  it("doubles a literal escape char in data and round-trips it", () => {
    // AI 21 serial legitimately contains the escape sequence `_1`.
    const c = "010950110153000310LOT_1";
    const enc = gs1ContentToDataMatrixFd(c);
    expect(enc).toBe("_1010950110153000310LOT__1");
    expect(dataMatrixFdToGs1Content(enc, GS1_DATAMATRIX_ESCAPE)).toBe(c);
  });
});

describe("constants", () => {
  it("treats only 6 and 7 as Expanded variants", () => {
    expect(GS1_DATABAR_EXPANDED_SYMBOLOGIES.has(6)).toBe(true);
    expect(GS1_DATABAR_EXPANDED_SYMBOLOGIES.has(7)).toBe(true);
    expect(GS1_DATABAR_EXPANDED_SYMBOLOGIES.has(1)).toBe(false);
  });

  it("uses the spec-maximum 22 as the Expanded Stacked segments default", () => {
    expect(GS1_DATABAR_DEFAULT_SEGMENTS).toBe(22);
    expect(GS1_DATABAR_DEFAULT_SEGMENTS % 2).toBe(0);
  });
});
