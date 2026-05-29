import { describe, it, expect } from "vitest";
import { generateZPL } from "./zplGenerator";
import { parseZPL } from "./zplParser";
import type { LabelConfig } from "../types/ObjectType";

const base: LabelConfig = { widthMm: 100, heightMm: 50, dpmm: 8 };

describe("Printer Settings Modal Tab 1 — generator", () => {
  it("omits ^MN / ^ML / ^MF / ^XB when no field is set", () => {
    const zpl = generateZPL(base, []);
    expect(zpl).not.toContain("^MN");
    expect(zpl).not.toContain("^ML");
    expect(zpl).not.toContain("^MF");
    expect(zpl).not.toContain("^XB");
  });

  it("emits ^MN with the selected tracking mode", () => {
    const zpl = generateZPL({ ...base, mediaTracking: "W" }, []);
    expect(zpl).toContain("^MNW");
  });

  it("emits ^ML with the maximum label length in dots", () => {
    const zpl = generateZPL({ ...base, maxLabelLength: 1200 }, []);
    expect(zpl).toContain("^ML1200");
  });

  it("emits ^MF with both positional params; missing slot defaults to N", () => {
    const both = generateZPL(
      { ...base, mediaFeedPowerUp: "F", mediaFeedHeadClose: "C" },
      [],
    );
    expect(both).toContain("^MFF,C");
    // Only one slot set: the other must still be present.
    const only = generateZPL({ ...base, mediaFeedPowerUp: "F" }, []);
    expect(only).toContain("^MFF,N");
  });

  it("emits bare ^XB when suppressBackfeed is true", () => {
    const zpl = generateZPL({ ...base, suppressBackfeed: true }, []);
    expect(zpl).toMatch(/\^XB(?![A-Z0-9])/);
  });

  it("omits ^XB when suppressBackfeed is false or undefined", () => {
    expect(generateZPL({ ...base, suppressBackfeed: false }, [])).not.toContain("^XB");
    expect(generateZPL({ ...base }, [])).not.toContain("^XB");
  });
});

describe("Printer Settings Modal Tab 1 — parser roundtrip", () => {
  it("round-trips all four commands without loss", () => {
    const orig: LabelConfig = {
      ...base,
      mediaTracking: "M",
      maxLabelLength: 800,
      mediaFeedPowerUp: "F",
      mediaFeedHeadClose: "L",
      suppressBackfeed: true,
    };
    const zpl = generateZPL(orig, []);
    const { labelConfig: parsed } = parseZPL(zpl);
    expect(parsed.mediaTracking).toBe("M");
    expect(parsed.maxLabelLength).toBe(800);
    expect(parsed.mediaFeedPowerUp).toBe("F");
    expect(parsed.mediaFeedHeadClose).toBe("L");
    expect(parsed.suppressBackfeed).toBe(true);
  });

  it("clamps an out-of-range ^MN value by ignoring it", () => {
    const { labelConfig } = parseZPL("^XA^MNZ^XZ");
    expect(labelConfig.mediaTracking).toBeUndefined();
  });

  it("reads ^MN's first positional even when a second param is present", () => {
    // ^MNa,b — b is the optional black-mark offset for W/M modes.
    // We don't model b, but a must still be captured.
    const { labelConfig } = parseZPL("^XA^MNY,10^XZ");
    expect(labelConfig.mediaTracking).toBe("Y");
  });

  it("ignores a non-positive ^ML value", () => {
    const { labelConfig } = parseZPL("^XA^ML0^XZ");
    expect(labelConfig.maxLabelLength).toBeUndefined();
  });

  // Pin the documented asymmetry: the generator fills the missing
  // ^MF slot with 'N' so the printer keeps its current behaviour
  // there, and the parser writes whatever it sees back into the
  // store. A roundtrip with only one slot set therefore materialises
  // the implicit 'N' on the other slot. This is by design; if the
  // generator ever emits a marker for "absent slot", revisit here.
  it("MF emit fills the unset slot with 'N' and the parser writes it back", () => {
    const zpl = generateZPL({ ...base, mediaFeedPowerUp: "F" }, []);
    expect(zpl).toContain("^MFF,N");
    const { labelConfig } = parseZPL(zpl);
    expect(labelConfig.mediaFeedPowerUp).toBe("F");
    expect(labelConfig.mediaFeedHeadClose).toBe("N");
  });
});

describe("Printer Settings Modal Tab 2 — Print Quality commands", () => {
  it("emits ^JZ with the selected reprint mode", () => {
    expect(generateZPL({ ...base, reprintAfterError: "Y" }, [])).toContain("^JZY");
    expect(generateZPL({ ...base, reprintAfterError: "N" }, [])).toContain("^JZN");
  });

  it("emits ^JT with the head-test interval", () => {
    expect(generateZPL({ ...base, headTestInterval: 500 }, [])).toContain("^JT500");
  });

  it("emits ~TA before ^XA (tilde-prefix takes effect immediately)", () => {
    const zpl = generateZPL({ ...base, tearOffAdjust: -30 }, []);
    expect(zpl).toContain("~TA-30");
    expect(zpl.indexOf("~TA")).toBeLessThan(zpl.indexOf("^XA"));
  });

  it("omits all three when their fields are undefined", () => {
    const zpl = generateZPL(base, []);
    expect(zpl).not.toContain("^JZ");
    expect(zpl).not.toContain("^JT");
    expect(zpl).not.toContain("~TA");
  });

  it("round-trips ^JZ / ^JT / ~TA without loss", () => {
    const orig = {
      ...base,
      reprintAfterError: "Y" as const,
      headTestInterval: 250,
      tearOffAdjust: 15,
    };
    const { labelConfig: parsed } = parseZPL(generateZPL(orig, []));
    expect(parsed.reprintAfterError).toBe("Y");
    expect(parsed.headTestInterval).toBe(250);
    expect(parsed.tearOffAdjust).toBe(15);
  });

  it("clamps out-of-range parser values for ^JT and ~TA", () => {
    expect(parseZPL("^XA^JT99999^XZ").labelConfig.headTestInterval).toBeUndefined();
    expect(parseZPL("~TA200^XA^XZ").labelConfig.tearOffAdjust).toBeUndefined();
    expect(parseZPL("~TA-200^XA^XZ").labelConfig.tearOffAdjust).toBeUndefined();
  });
});
