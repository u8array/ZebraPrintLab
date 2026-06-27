import { describe, it, expect } from "vitest";
import {
  hasTemplateMarkers,
  extractTemplateRefs,
  resolveTemplateMarkers,
  embedsToMarkers,
  markersToEmbeds,
  pickEmbedChar,
  capLiteralLength,
  literalInsertRoom,
  substituteTemplateMarker,
  renameTemplateMarkers,
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

describe("capLiteralLength", () => {
  it("caps a purely-literal value to maxLength", () => {
    expect(capLiteralLength("123456789", 5)).toBe("12345");
  });
  it("leaves a short value untouched", () => {
    expect(capLiteralLength("12", 5)).toBe("12");
  });
  it("never caps when a marker is present (printed length is the variable's)", () => {
    expect(capLiteralLength("«sku»0123456789", 3)).toBe("«sku»0123456789");
  });
  it("is a no-op when no cap is set", () => {
    expect(capLiteralLength("123456789", undefined)).toBe("123456789");
  });
});

describe("literalInsertRoom", () => {
  it("returns remaining room accounting for the replaced selection", () => {
    expect(literalInsertRoom("123", 0, "ABC", 5)).toBe(2);
    expect(literalInsertRoom("123", 2, "ABC", 5)).toBe(4);
  });
  it("clamps to zero when the field is already full", () => {
    expect(literalInsertRoom("12345", 0, "X", 5)).toBe(0);
  });
  it("returns Infinity when no cap is set", () => {
    expect(literalInsertRoom("123", 0, "X", undefined)).toBe(Infinity);
  });
  it("returns Infinity when a marker is present in the value or the insertion", () => {
    expect(literalInsertRoom("«sku»", 0, "X", 5)).toBe(Infinity);
    expect(literalInsertRoom("12", 0, "«sku»", 5)).toBe(Infinity);
  });
});

describe("substituteTemplateMarker", () => {
  it("replaces a marker with the literal replacement", () => {
    expect(substituteTemplateMarker("Hello «sku»", "sku", "ABC")).toBe("Hello ABC");
  });
  it("replaces every occurrence", () => {
    expect(substituteTemplateMarker("«sku»-«sku»", "sku", "X")).toBe("X-X");
  });
  it("leaves other markers untouched", () => {
    expect(substituteTemplateMarker("«sku» «lot»", "sku", "X")).toBe("X «lot»");
  });
  it("is identity-preserving when the name is absent", () => {
    const s = "no markers here";
    expect(substituteTemplateMarker(s, "sku", "X")).toBe(s);
  });
  it("can delete a marker by replacing with empty string", () => {
    expect(substituteTemplateMarker("a«sku»b", "sku", "")).toBe("ab");
  });
});

describe("renameTemplateMarkers (single pass, collision-safe)", () => {
  it("swaps two names without cascading", () => {
    const out = renameTemplateMarkers("«a»-«b»", new Map([["a", "b"], ["b", "a"]]));
    expect(out).toBe("«b»-«a»");
  });

  it("renames a chain by original name only (a->b, b->c)", () => {
    const out = renameTemplateMarkers("«a» «b»", new Map([["a", "b"], ["b", "c"]]));
    expect(out).toBe("«b» «c»");
  });

  it("leaves unmapped markers (incl. clock) untouched", () => {
    const out = renameTemplateMarkers("«a» «clock:Y» «x»", new Map([["a", "z"]]));
    expect(out).toBe("«z» «clock:Y» «x»");
  });

  it("is identity on an empty map", () => {
    expect(renameTemplateMarkers("«a»", new Map())).toBe("«a»");
  });
});
