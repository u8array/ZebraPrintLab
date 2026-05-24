import { describe, it, expect } from "vitest";
import {
  hasTemplateMarkers,
  extractTemplateRefs,
  resolveTemplateMarkers,
  embedsToMarkers,
  markersToEmbeds,
  pickEmbedChar,
} from "./fnTemplate";
import type { Variable } from "../types/Variable";

const vars: Variable[] = [
  { id: "a", name: "sku", fnNumber: 1, defaultValue: "DEFAULT-1" },
  { id: "b", name: "price", fnNumber: 2, defaultValue: "9.99" },
  { id: "c", name: "lot", fnNumber: 5, defaultValue: "X" },
];

describe("hasTemplateMarkers", () => {
  it("matches single marker", () => {
    expect(hasTemplateMarkers("hello «sku»")).toBe(true);
  });
  it("matches multiple markers", () => {
    expect(hasTemplateMarkers("«a» and «b»")).toBe(true);
  });
  it("returns false on plain text", () => {
    expect(hasTemplateMarkers("plain text")).toBe(false);
  });
  it("does not match an opening guillemet alone", () => {
    expect(hasTemplateMarkers("« no closer")).toBe(false);
  });
});

describe("extractTemplateRefs", () => {
  it("preserves source order and duplicates", () => {
    expect(extractTemplateRefs("«a» and «b» again «a»")).toEqual(["a", "b", "a"]);
  });
});

describe("resolveTemplateMarkers", () => {
  it("substitutes each marker via the resolver", () => {
    const r = resolveTemplateMarkers("«sku»-«price»", (n) =>
      n === "sku" ? "ABC" : n === "price" ? "19.99" : undefined,
    );
    expect(r).toBe("ABC-19.99");
  });
  it("leaves unknown markers literal", () => {
    const r = resolveTemplateMarkers("«known»/«missing»", (n) => (n === "known" ? "v" : undefined));
    expect(r).toBe("v/«missing»");
  });
});

describe("embedsToMarkers", () => {
  const fnToName = new Map([
    [1, "sku"],
    [2, "price"],
  ]);
  it("converts whole-field embeds with default # delimiter", () => {
    expect(embedsToMarkers("Hello #1#-#2#", "#", fnToName)).toBe("Hello «sku»-«price»");
  });
  it("converts substring embeds (slice args discarded)", () => {
    expect(embedsToMarkers("#1,0,3#", "#", fnToName)).toBe("«sku»");
  });
  it("respects a custom embedChar set via ^FE", () => {
    expect(embedsToMarkers("Hello @1@-@2@", "@", fnToName)).toBe("Hello «sku»-«price»");
  });
  it("leaves embeds for unknown FN numbers literal (loss-less round-trip)", () => {
    expect(embedsToMarkers("#9#", "#", fnToName)).toBe("#9#");
  });
});

describe("markersToEmbeds", () => {
  it("emits embeds for known variable names + reports the fnNumbers used", () => {
    const r = markersToEmbeds("«sku»-«price»", vars, "#");
    expect(r.payload).toBe("#1#-#2#");
    expect([...r.referencedFnNumbers].sort()).toEqual([1, 2]);
  });
  it("leaves markers literal when the named variable does not exist", () => {
    const r = markersToEmbeds("«sku»-«gone»", vars, "#");
    expect(r.payload).toBe("#1#-«gone»");
    expect([...r.referencedFnNumbers]).toEqual([1]);
  });
  it("dedupes referencedFnNumbers when the same name appears twice", () => {
    const r = markersToEmbeds("«sku»/«sku»", vars, "#");
    expect(r.payload).toBe("#1#/#1#");
    expect([...r.referencedFnNumbers]).toEqual([1]);
  });
  it("uses a non-default embedChar passed by the caller", () => {
    const r = markersToEmbeds("«sku»-«price»", vars, "@");
    expect(r.payload).toBe("@1@-@2@");
  });
});

describe("pickEmbedChar", () => {
  it("returns # when no payload contains it", () => {
    expect(pickEmbedChar(["plain text", "more"])).toBe("#");
  });
  it("falls back to next candidate when # appears in any payload", () => {
    expect(pickEmbedChar(["Item #SKU-1", "other"])).toBe("@");
  });
  it("returns null when every candidate is taken", () => {
    expect(pickEmbedChar(["#@|%&?!"])).toBe(null);
  });
});
