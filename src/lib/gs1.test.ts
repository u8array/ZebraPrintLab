import { describe, it, expect } from "vitest";
import {
  gtin14WithCheck,
  wrapGs1AIs,
  GS1_DATABAR_EXPANDED_SYMBOLOGIES,
  GS1_DATABAR_DEFAULT_SEGMENTS,
} from "./gs1";

describe("gtin14WithCheck", () => {
  it("computes the check digit for a 13-digit body", () => {
    // Known reference: GTIN-13 "0112345678901" → check 1 (verified empirically)
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
