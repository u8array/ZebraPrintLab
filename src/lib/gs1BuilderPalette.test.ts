import { describe, it, expect } from "vitest";
import { aiSpec, validateGs1Segments } from "./gs1";
import {
  AI_BY_GROUP,
  GS1_COMMON_AIS,
  GS1_BUILDER_PRESETS,
  GS1_REQ_ENFORCED_TYPES,
  reqSatisfiableInBuilder,
} from "./gs1BuilderPalette";

describe("reqSatisfiableInBuilder", () => {
  it("accepts AIs without req and AIs whose requisites are modeled", () => {
    expect(reqSatisfiableInBuilder(aiSpec("400")!)).toBe(true); // no req
    expect(reqSatisfiableInBuilder(aiSpec("3103")!)).toBe(true); // req 01/02
    // 3920's alternatives use 'n' wildcards (01+31nn); 31xx is modeled.
    expect(reqSatisfiableInBuilder(aiSpec("3920")!)).toBe(true);
  });

  it("rejects AIs whose only requisite is an omitted multiComponent AI", () => {
    // 8111 req=255 (GCN, multiComponent, not in the catalog): guaranteed dead
    // end on req-enforced carriers, so the palette hides it there.
    expect(reqSatisfiableInBuilder(aiSpec("8111")!)).toBe(false);
  });

  it("keeps every curated common AI satisfiable (palette hint math relies on it)", () => {
    for (const ai of GS1_COMMON_AIS) {
      expect(reqSatisfiableInBuilder(aiSpec(ai)!), `common AI ${ai}`).toBe(true);
    }
  });
});

describe("palette catalog hygiene", () => {
  it("classifies every AI into a real group ('other' stays empty)", () => {
    // A dictionary update introducing an AI the generator's groupFor doesn't
    // know lands in 'other'; this forces a conscious classification.
    expect(AI_BY_GROUP.other).toEqual([]);
  });

  it("req policy covers exactly the bwip req-enforcing carriers", () => {
    expect([...GS1_REQ_ENFORCED_TYPES].sort()).toEqual(["datamatrix", "gs1databar"]);
  });
});

describe("GS1_BUILDER_PRESETS (onboarding sets stay appliable)", () => {
  it("every preset AI is modeled and req-satisfiable in the builder", () => {
    for (const preset of GS1_BUILDER_PRESETS) {
      for (const ai of preset.ais) {
        const spec = aiSpec(ai);
        expect(spec, `preset AI ${ai} is modeled`).toBeDefined();
        expect(reqSatisfiableInBuilder(spec!), `preset AI ${ai} req-satisfiable`).toBe(true);
      }
    }
  });

  it("every preset seeds a set with no set-level rule violation on req-enforced carriers", () => {
    // A preset opens the builder pre-filled; a set-level error (exclusive AI,
    // unmet requisite) at load would be an unappliable onboarding dead end.
    for (const preset of GS1_BUILDER_PRESETS) {
      const segs = preset.ais.map((ai) => ({ ai, value: "" }));
      // enforceReq = true is the strictest carrier (datamatrix/gs1databar).
      expect(validateGs1Segments(segs, true), `preset ${preset.nameKey}`).toBeNull();
    }
  });
});
