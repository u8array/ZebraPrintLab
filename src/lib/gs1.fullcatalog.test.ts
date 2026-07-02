import { describe, it, expect } from "vitest";
import {
  aiSpec,
  validateGs1Segment,
  parseGs1ToSegments,
  segmentsToContent,
  segmentsToElementString,
  decimalValuePreview,
  GS1_GS,
} from "./gs1";
import { AI_BY_GROUP, GS1_COMMON_AIS } from "./gs1BuilderPalette";

describe("full AI catalog wiring", () => {
  it("resolves a decimal-range AI to a concrete spec with decimalPlaces", () => {
    // 3103 = NET WEIGHT (kg), 3 implied decimal places (the 4th digit).
    const s = aiSpec("3103");
    expect(s?.kind).toBe("decimal");
    expect(s?.len).toBe(6);
    expect(s?.decimalPlaces).toBe(3);
    expect(aiSpec("3100")?.decimalPlaces).toBe(0);
    expect(aiSpec("3105")?.decimalPlaces).toBe(5);
  });

  it("carries an EN title on resolved specs", () => {
    expect(aiSpec("00")?.title).toBe("SSCC");
    expect(aiSpec("8200")?.title).toBe("PRODUCT URL");
  });

  it("validates a decimal AI as a fixed 6-digit numeric field", () => {
    expect(validateGs1Segment("3103", "001500")).toBeNull();
    expect(validateGs1Segment("3103", "15")).toBe("exactLength");
    expect(validateGs1Segment("3103", "00150X")).toBe("digitsOnly");
  });

  it("validates a fixed-alphanumeric AI (country alpha-2) by charset + length", () => {
    // 4307 = SHIP TO COUNTRY, fixedAlnum len 2.
    expect(aiSpec("4307")?.kind).toBe("fixedAlnum");
    expect(validateGs1Segment("4307", "DE")).toBeNull();
    expect(validateGs1Segment("4307", "D")).toBe("exactLength");
    // iso3166alpha2 shape: lowercase / digits rejected (real list is encoder-side).
    expect(validateGs1Segment("4307", "de")).toBe("countryCode");
    expect(validateGs1Segment("4307", "12")).toBe("countryCode");
  });

  it("validates yesno AIs as strictly 0 or 1 (4321 dangerous goods)", () => {
    expect(validateGs1Segment("4321", "0")).toBeNull();
    expect(validateGs1Segment("4321", "1")).toBeNull();
    expect(validateGs1Segment("4321", "9")).toBe("yesno");
  });

  it("enforces CSET 39 for type-Y AIs (8010 CPID)", () => {
    expect(validateGs1Segment("8010", "AB-12/3#")).toBeNull();
    // lowercase is CSET 82 but not CSET 39
    expect(validateGs1Segment("8010", "abc")).toBe("charset");
  });

  it("supports 8030 DIGSIG as base64url (type Z, previously skipped)", () => {
    expect(aiSpec("8030")?.kind).toBe("varAlnum");
    expect(aiSpec("8030")?.len).toBe(90);
    expect(validateGs1Segment("8030", "aGVsbG8_LXdvcmxk-_")).toBeNull();
    // '/' is base64 (not base64url) and also CSET82; must be rejected here.
    expect(validateGs1Segment("8030", "abc/def")).toBe("charset");
  });

  it("carries csumalpha metadata on 8013 GMN without validating it yet", () => {
    expect(aiSpec("8013")?.linters).toContain("csumalpha");
    // Deliberately unvalidated (deferred): any CSET82 value passes.
    expect(validateGs1Segment("8013", "ABC123")).toBeNull();
  });

  it("round-trips a newly-catalogued AI (240) through parse -> content", () => {
    const segs = parseGs1ToSegments("(01)09501101530003(240)ABC123");
    expect(segs).not.toBeNull();
    const raw = segmentsToContent(segs!);
    expect(parseGs1ToSegments(raw)).toEqual(segs);
    expect(segmentsToElementString(segs!)).toBe("(01)09501101530003(240)ABC123");
  });

  it("round-trips a decimal AI (3103) as raw digits (no decimal point stored)", () => {
    const segs = parseGs1ToSegments("(01)09501101530003(3103)001500");
    expect(segs).not.toBeNull();
    expect(segs!.find((s) => s.ai === "3103")?.value).toBe("001500");
    // 01 (fixed) then 3103 (fixed) -> no GS separator needed.
    expect(segmentsToContent(segs!)).toBe("0109501101530003" + "3103001500");
  });

  it("excludes multi-component AIs from the builder + parser (no mis-parse)", () => {
    // 8006 (ITIP) is multi-component -> not in the resolved catalog.
    expect(aiSpec("8006")).toBeUndefined();
    // An element string using it does not parse (falls back to verbatim upstream).
    expect(parseGs1ToSegments("(8006)123456789012340102")).toBeNull();
  });

  it("expands non-decimal ranges to concrete AIs (no literal hyphen keys)", () => {
    // 3900-3909 (amount), 91-99 (internal) are ranges too, not just decimals.
    expect(aiSpec("3903")?.kind).toBe("varNum");
    expect(aiSpec("95")?.group).toBe("internal");
    expect(aiSpec("3900-3909")).toBeUndefined();
    expect(aiSpec("91-99")).toBeUndefined();
    // no palette entry carries a hyphen (would be a broken range button)
    expect(Object.values(AI_BY_GROUP).flat().some((s) => s.ai.includes("-"))).toBe(false);
  });

  it("validates an 8-digit date AI (7250 DOB, YYYYMMDD)", () => {
    expect(aiSpec("7250")?.kind).toBe("date");
    expect(aiSpec("7250")?.len).toBe(8);
    expect(validateGs1Segment("7250", "20050815")).toBeNull();
    expect(validateGs1Segment("7250", "050815")).toBe("dateFormat"); // 6 digits too short
    expect(validateGs1Segment("7250", "20051315")).toBe("dateMonth"); // month 13
    expect(validateGs1Segment("11", "050815")).toBeNull(); // 6-digit date still ok
  });

  it("permits DD=00 only for yymmd0-flavored dates (bwip parity)", () => {
    // 11 PROD DATE is yymmd0; 7006 FIRST FREEZE DATE is strict yymmdd.
    expect(validateGs1Segment("11", "050800")).toBeNull();
    expect(validateGs1Segment("7006", "050800")).toBe("dateDay");
  });

  it("validates real leap years for 4-digit-year dates (7250)", () => {
    expect(validateGs1Segment("7250", "20240229")).toBeNull();
    expect(validateGs1Segment("7250", "20230229")).toBe("dateDay");
    expect(validateGs1Segment("7250", "20050800")).toBe("dateDay"); // no day00
    // YY form keeps the 29-cap (century ambiguous).
    expect(validateGs1Segment("11", "230229")).toBeNull();
  });

  it("falls back to the AI number for empty-title AIs", () => {
    // 8110/8112 have no title in the source dict.
    expect(aiSpec("8110")?.title).toBe("");
  });

  it("groups the palette across the expanded group set", () => {
    expect(AI_BY_GROUP.measures.length).toBeGreaterThan(20);
    expect(AI_BY_GROUP.logistics.length).toBeGreaterThan(0);
    expect(AI_BY_GROUP.url.some((s) => s.ai === "8200")).toBe(true);
    // no multi-component leaked into any group
    expect(Object.values(AI_BY_GROUP).flat().some((s) => s.ai === "8006")).toBe(false);
  });

  it("02/03 share 01's gtin autocomplete (deliberate: all three carry GTINs)", () => {
    // Product decision, not a bug: the builder's gtin semantics are "enter the
    // body without its check digit" (hint shown); 02 CONTENT and 03 MTO GTIN
    // are GTINs like 01, so they complete identically. The risky pairings are
    // covered by ex rules (01/02/03 mutually exclusive per dictionary).
    for (const ai of ["01", "02", "03"]) {
      expect(aiSpec(ai)?.kind).toBe("gtin");
      // 12-digit GTIN-13 body -> zero-pad to 13 + check digit.
      expect(segmentsToContent([{ ai, value: "400638133393" }])).toBe(`${ai}04006381333931`);
      // Full 14 digits must carry a valid check digit.
      expect(validateGs1Segment(ai, "04006381333931")).toBeNull();
      expect(validateGs1Segment(ai, "04006381333932")).toBe("checkDigit");
    }
  });

  it("every curated common AI resolves to a catalog spec (no dead palette button)", () => {
    for (const ai of GS1_COMMON_AIS) {
      expect(aiSpec(ai), `common AI ${ai} missing from catalog`).toBeDefined();
    }
  });

  it("keeps a GS separator between two variable AIs (unchanged emit rule)", () => {
    const segs = parseGs1ToSegments("(10)LOT1(240)REF2");
    // 10 is varAlnum -> GS after it, before 240.
    expect(segmentsToContent(segs!)).toBe("10LOT1" + GS1_GS + "240REF2");
  });
});

describe('decimalValuePreview', () => {
  it('inserts the implied decimal point per the AI decimal position', () => {
    expect(decimalValuePreview('3103', '001500')).toBe('1.500');
    expect(decimalValuePreview('3100', '001500')).toBe('1500');
    expect(decimalValuePreview('3102', '001500')).toBe('15.00');
  });
  it('returns null for non-decimal AIs or non-numeric values', () => {
    expect(decimalValuePreview('01', '09501101530003')).toBeNull();
    expect(decimalValuePreview('3103', '00x')).toBeNull();
  });
});
