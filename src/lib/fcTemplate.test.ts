import { describe, it, expect } from "vitest";
import {
  channelDatesFrom,
  hasClockMarkers,
  extractClockTokens,
  resolveClockMarkers,
  tokensToMarkers,
  markersToTokens,
  pickClockChars,
  isDefaultClockChars,
  DEFAULT_CLOCK_CHARS,
} from "./fcTemplate";
import { clockOffsetSchema, labelConfigSchema } from "../types/LabelConfig";

// Fixed reference date used across formatter tests so the assertions
// stay stable regardless of when the suite runs. 2026-03-14 13:09:42
// is also a non-zero-padded day/month so the padding assertions bite.
const NOW = new Date(2026, 2, 14, 13, 9, 42);
const dates = (d: Date) => channelDatesFrom(d, undefined, undefined);

describe("hasClockMarkers", () => {
  it("matches a single «clock:T» marker", () => {
    expect(hasClockMarkers("Date: «clock:d»")).toBe(true);
  });
  it("matches channel-tagged markers", () => {
    expect(hasClockMarkers("«clock2:d»")).toBe(true);
    expect(hasClockMarkers("«clock3:m»")).toBe(true);
  });
  it("ignores variable markers", () => {
    expect(hasClockMarkers("«var:sku»")).toBe(false);
  });
});

describe("extractClockTokens", () => {
  it("preserves source order + duplicates with channel info", () => {
    expect(extractClockTokens("«clock:d»/«clock2:m»/«clock3:Y» «clock:d»"))
      .toEqual([
        { token: "d", channel: 1 },
        { token: "m", channel: 2 },
        { token: "Y", channel: 3 },
        { token: "d", channel: 1 },
      ]);
  });
});

describe("resolveClockMarkers", () => {
  it("substitutes each known token with the formatted current value", () => {
    expect(resolveClockMarkers("«clock:Y»-«clock:m»-«clock:d»", dates(NOW)))
      .toBe("2026-03-14");
  });
  it("pads single-digit components", () => {
    expect(resolveClockMarkers("«clock:H»:«clock:M»:«clock:S»", dates(NOW)))
      .toBe("13:09:42");
  });
  it("leaves unknown tokens literal", () => {
    expect(resolveClockMarkers("«clock:Q»", dates(NOW))).toBe("«clock:Q»");
  });
  it("uses the secondary Date for «clock2:T» markers", () => {
    const channels = channelDatesFrom(NOW, { days: 30 }, undefined);
    expect(resolveClockMarkers("«clock:d»/«clock2:d»", channels)).toBe("14/13");
  });
  it("uses the tertiary Date for «clock3:T» markers", () => {
    const channels = channelDatesFrom(NOW, undefined, { years: 1 });
    expect(resolveClockMarkers("«clock:Y»/«clock3:Y»", channels)).toBe("2026/2027");
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
  it("tags secondary/tertiary chars with the channel suffix", () => {
    expect(tokensToMarkers("%d{H#Y", DEFAULT_CLOCK_CHARS))
      .toBe("«clock:d»«clock2:H»«clock3:Y»");
  });
  it("leaves unknown letters after clock chars untouched", () => {
    expect(tokensToMarkers("%Z", DEFAULT_CLOCK_CHARS)).toBe("%Z");
  });
});

describe("markersToTokens", () => {
  it("emits the per-channel char for each marker", () => {
    expect(markersToTokens("«clock:d»/«clock2:m»/«clock3:Y»", DEFAULT_CLOCK_CHARS))
      .toBe("%d/{m/#Y");
  });
  it("respects custom clock chars per channel", () => {
    expect(markersToTokens("«clock:H»«clock2:M»«clock3:S»", { date: "@", time: "!", tertiary: "$" }))
      .toBe("@H!M$S");
  });
  it("leaves unknown token letters as literal markers", () => {
    expect(markersToTokens("«clock:Q»", DEFAULT_CLOCK_CHARS)).toBe("«clock:Q»");
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
    expect(pickClockChars(["%$*+="])).toBeNull();
  });
});

describe("Julian day formatter", () => {
  it("treats Jan 1 as day 1", () => {
    expect(resolveClockMarkers("«clock:j»", dates(new Date(2026, 0, 1)))).toBe("001");
  });
  it("treats Dec 31 of a non-leap year as 365", () => {
    expect(resolveClockMarkers("«clock:j»", dates(new Date(2026, 11, 31)))).toBe("365");
  });
  it("treats Dec 31 of a leap year as 366", () => {
    expect(resolveClockMarkers("«clock:j»", dates(new Date(2024, 11, 31)))).toBe("366");
  });
  it("doesn't off-by-one on a DST-spring-forward day", () => {
    // 2026-03-29 is DST switch in central Europe. Julian day is the
    // 88th day of a non-leap year (31+28+29 = 88). A naive ms-diff
    // would give 87 because the day is 23 hours long.
    expect(resolveClockMarkers("«clock:j»", dates(new Date(2026, 2, 29)))).toBe("088");
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

describe("clockOffsetSchema", () => {
  it("rejects an all-undefined offset object", () => {
    expect(clockOffsetSchema.safeParse({}).success).toBe(false);
  });
  it("rejects an offset with all-zero slots", () => {
    expect(clockOffsetSchema.safeParse({ years: 0, months: 0 }).success).toBe(false);
  });
  it("accepts a single non-zero slot", () => {
    expect(clockOffsetSchema.safeParse({ months: 6 }).success).toBe(true);
  });
});

describe("labelConfigSchema clock-offset preprocess", () => {
  it("coerces an empty secondaryClockOffset on import to undefined (no whole-label rejection)", () => {
    const r = labelConfigSchema.safeParse({
      widthMm: 100, heightMm: 60, dpmm: 8,
      secondaryClockOffset: {},
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.secondaryClockOffset).toBeUndefined();
  });
  it("coerces an all-zero tertiaryClockOffset to undefined", () => {
    const r = labelConfigSchema.safeParse({
      widthMm: 100, heightMm: 60, dpmm: 8,
      tertiaryClockOffset: { months: 0, days: 0 },
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.tertiaryClockOffset).toBeUndefined();
  });
});

describe("channelDatesFrom", () => {
  it("returns primary Date for all channels when offsets are undefined", () => {
    const c = channelDatesFrom(NOW, undefined, undefined);
    expect(c.primary).toBe(NOW);
    expect(c.secondary.getTime()).toBe(NOW.getTime());
    expect(c.tertiary.getTime()).toBe(NOW.getTime());
  });
  it("applies the secondary offset to the secondary channel only", () => {
    const c = channelDatesFrom(NOW, { days: 7 }, undefined);
    expect(c.secondary.getDate()).toBe(21);
    expect(c.tertiary.getDate()).toBe(14);
  });
});
