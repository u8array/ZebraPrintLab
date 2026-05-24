import { describe, it, expect } from "vitest";
import {
  hasClockMarkers,
  extractClockTokens,
  resolveClockMarkers,
  tokensToMarkers,
  markersToTokens,
  pickClockChars,
  isDefaultClockChars,
  DEFAULT_CLOCK_CHARS,
} from "./fcTemplate";

// Fixed reference date used across formatter tests so the assertions
// stay stable regardless of when the suite runs. 2026-03-14 13:09:42
// is also a non-zero-padded day/month so the padding assertions bite.
const NOW = new Date(2026, 2, 14, 13, 9, 42);

describe("hasClockMarkers", () => {
  it("matches a single «clock:T» marker", () => {
    expect(hasClockMarkers("Date: «clock:d»")).toBe(true);
  });
  it("ignores variable markers", () => {
    expect(hasClockMarkers("«var:sku»")).toBe(false);
  });
});

describe("extractClockTokens", () => {
  it("preserves source order + duplicates", () => {
    expect(extractClockTokens("«clock:d»/«clock:m»/«clock:Y» «clock:d»"))
      .toEqual(["d", "m", "Y", "d"]);
  });
});

describe("resolveClockMarkers", () => {
  it("substitutes each known token with the formatted current value", () => {
    expect(resolveClockMarkers("«clock:Y»-«clock:m»-«clock:d»", NOW))
      .toBe("2026-03-14");
  });
  it("pads single-digit components", () => {
    expect(resolveClockMarkers("«clock:H»:«clock:M»:«clock:S»", NOW))
      .toBe("13:09:42");
  });
  it("leaves unknown tokens literal", () => {
    expect(resolveClockMarkers("«clock:Q»", NOW)).toBe("«clock:Q»");
  });
});

describe("tokensToMarkers", () => {
  it("converts default-char sequences to markers", () => {
    expect(tokensToMarkers("Date %d/%m/%Y", DEFAULT_CLOCK_CHARS))
      .toBe("Date «clock:d»/«clock:m»/«clock:Y»");
  });
  it("respects custom clock chars", () => {
    expect(tokensToMarkers("@d/@m/@Y", { date: "@", time: "!", tertiary: "$" }))
      .toBe("«clock:d»/«clock:m»/«clock:Y»");
  });
  it("treats all three clock chars equivalently for token recognition", () => {
    // Tokens after the time and tertiary chars also get recognised —
    // matches Zebra firmware behaviour where all three draw from the
    // same RTC pool.
    expect(tokensToMarkers("%d{H#Y", DEFAULT_CLOCK_CHARS))
      .toBe("«clock:d»«clock:H»«clock:Y»");
  });
  it("leaves unknown letters after clock chars untouched", () => {
    // `%Z` is timezone in strftime but not in our TOKEN_FORMATTERS yet.
    expect(tokensToMarkers("%Z", DEFAULT_CLOCK_CHARS)).toBe("%Z");
  });
});

describe("markersToTokens", () => {
  it("emits the date char + token letter for every marker", () => {
    expect(markersToTokens("«clock:d»/«clock:m»/«clock:Y»", DEFAULT_CLOCK_CHARS.date))
      .toBe("%d/%m/%Y");
  });
  it("uses the supplied date char for all tokens", () => {
    expect(markersToTokens("«clock:H»:«clock:M»", "@")).toBe("@H:@M");
  });
  it("leaves unknown token letters as literal markers", () => {
    expect(markersToTokens("«clock:Q»", "%")).toBe("«clock:Q»");
  });
});

describe("pickClockChars", () => {
  it("returns defaults when no payload clashes", () => {
    expect(pickClockChars(["plain text"])).toEqual(DEFAULT_CLOCK_CHARS);
  });
  it("falls back to alternates when any default appears in payloads", () => {
    const r = pickClockChars(["100% match"]);
    expect(r).not.toBeNull();
    expect(r!.date).not.toBe("%");
  });
  it("returns null when every candidate for one slot clashes", () => {
    // Saturate the date-candidate list — should bail.
    expect(pickClockChars(["%$*+="])).toBeNull();
  });
});

describe("Julian day formatter", () => {
  it("treats Jan 1 as day 1", () => {
    expect(resolveClockMarkers("«clock:j»", new Date(2026, 0, 1))).toBe("001");
  });
  it("treats Dec 31 of a non-leap year as 365", () => {
    expect(resolveClockMarkers("«clock:j»", new Date(2026, 11, 31))).toBe("365");
  });
  it("treats Dec 31 of a leap year as 366", () => {
    expect(resolveClockMarkers("«clock:j»", new Date(2024, 11, 31))).toBe("366");
  });
  it("doesn't off-by-one on a DST-spring-forward day", () => {
    // 2026-03-29 is DST switch in central Europe. Julian day is the
    // 88th day of a non-leap year (31+28+29 = 88). A naive ms-diff
    // would give 87 because the day is 23 hours long.
    expect(resolveClockMarkers("«clock:j»", new Date(2026, 2, 29))).toBe("088");
  });
});

describe("tokensToMarkers safety", () => {
  it("returns the payload unchanged when every clock char is empty", () => {
    expect(tokensToMarkers("Date %d/%m", { date: "", time: "", tertiary: "" }))
      .toBe("Date %d/%m");
  });
});

describe("isDefaultClockChars", () => {
  it("identifies the default triple", () => {
    expect(isDefaultClockChars(DEFAULT_CLOCK_CHARS)).toBe(true);
  });
  it("rejects any deviation", () => {
    expect(isDefaultClockChars({ date: "@", time: "{", tertiary: "#" })).toBe(false);
  });
});
