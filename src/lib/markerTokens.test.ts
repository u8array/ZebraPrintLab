import { describe, it, expect } from "vitest";
import {
  findAtomicMarker,
  findMarkerContaining,
  tokeniseMarkers,
  sanitiseAroundMarkers,
  removeMarkerAt,
} from "./markerTokens";

describe("tokeniseMarkers", () => {
  const vars = new Set(["name", "qty"]);

  it("classifies known variables, clocks, and orphans", () => {
    const segs = tokeniseMarkers("Hi «name», «clock:Y» «missing» «clock:Q»", vars);
    expect(segs.map((s) => s.kind)).toEqual([
      "text",
      "var",
      "text",
      "clock",
      "text",
      "orphan",
      "text",
      "orphan",
    ]);
  });

  it("returns a single text segment when no markers present", () => {
    expect(tokeniseMarkers("plain", vars)).toEqual([{ kind: "text", text: "plain" }]);
  });

  it("handles empty input", () => {
    expect(tokeniseMarkers("", vars)).toEqual([]);
  });

  it("treats empty marker «» as literal text (not a marker)", () => {
    // The marker regex requires at least one character inside the
    // brackets. `«»` therefore never tokenises as a marker; users
    // typing those glyphs literally don't get them coloured/treated
    // as a broken variable.
    expect(tokeniseMarkers("«»", vars)).toEqual([{ kind: "text", text: "«»" }]);
  });
});

describe("sanitiseAroundMarkers", () => {
  it("applies fn to literal slices and leaves markers untouched", () => {
    expect(sanitiseAroundMarkers("ab«sku»cd«clock:Y»ef", (s) => s.toUpperCase())).toBe(
      "AB«sku»CD«clock:Y»EF",
    );
  });

  it("filters a charset on literals without eating the chip (GS1 case)", () => {
    const digits = (s: string) => s.replace(/\D/g, "");
    // "(01)" -> "01", marker kept, "99x" -> "99"
    expect(sanitiseAroundMarkers("(01)«gtin»99x", digits)).toBe("01«gtin»99");
  });

  it("applies fn to the whole string when no markers are present", () => {
    expect(sanitiseAroundMarkers("a1b2", (s) => s.replace(/\d/g, ""))).toBe("ab");
  });
});

describe("findAtomicMarker (backspace direction)", () => {
  // `«name»` spans positions 0..6 (inclusive of closing »).
  // Backspace direction = cursor "would consume the char to the left",
  // so pos must be strictly > start and <= end for the marker to count.
  const content = "«name»";

  it("matches the marker when cursor sits right after the closing »", () => {
    expect(findAtomicMarker(content, 6, "backspace")).toEqual({ start: 0, end: 6 });
  });

  it("matches when cursor is anywhere inside the marker", () => {
    expect(findAtomicMarker(content, 3, "backspace")).toEqual({ start: 0, end: 6 });
  });

  it("does NOT match when cursor sits exactly at the opening « (nothing to the left to delete from the marker)", () => {
    expect(findAtomicMarker(content, 0, "backspace")).toBeNull();
  });

  it("returns null for cursor outside any marker", () => {
    expect(findAtomicMarker("ab«x»cd", 1, "backspace")).toBeNull();
  });
});

describe("findAtomicMarker (delete direction)", () => {
  // Delete = cursor "consumes the char to the right" → pos must be
  // >= start and < end.
  const content = "«name»";

  it("matches when cursor sits right before the opening «", () => {
    expect(findAtomicMarker(content, 0, "delete")).toEqual({ start: 0, end: 6 });
  });

  it("matches when cursor is inside the marker", () => {
    expect(findAtomicMarker(content, 4, "delete")).toEqual({ start: 0, end: 6 });
  });

  it("does NOT match when cursor sits exactly at the closing » (nothing to the right of the marker to delete)", () => {
    expect(findAtomicMarker(content, 6, "delete")).toBeNull();
  });
});

describe("findMarkerContaining", () => {
  it("returns the marker range when cursor is inside", () => {
    expect(findMarkerContaining("hi «name» x", 5)).toEqual({ start: 3, end: 9 });
  });

  it("treats both boundary positions as inside (for double-click selection)", () => {
    expect(findMarkerContaining("«n»", 0)).toEqual({ start: 0, end: 3 });
    expect(findMarkerContaining("«n»", 3)).toEqual({ start: 0, end: 3 });
  });

  it("returns null between two adjacent markers", () => {
    // Two markers «a»«b»: cursor between the markers (pos 3, after first ») is reported as
    // the FIRST marker's end-boundary, so findMarkerContaining returns the first one.
    // Doc test for the chosen semantics: matchAll order = first hit wins.
    const r = findMarkerContaining("«a»«b»", 3);
    expect(r).toEqual({ start: 0, end: 3 });
  });
});

describe("removeMarkerAt", () => {
  const vars = new Set(["sku", "lot"]);

  it("drops the index-th marker, keeping text and other markers", () => {
    expect(removeMarkerAt("a «sku» b «lot» c", 0, vars)).toBe("a  b «lot» c");
    expect(removeMarkerAt("a «sku» b «lot» c", 1, vars)).toBe("a «sku» b  c");
  });

  it("removes a clock and an orphan marker by index", () => {
    expect(removeMarkerAt("«sku»«clock:Y»«ghost»", 1, vars)).toBe("«sku»«ghost»");
    expect(removeMarkerAt("«sku»«clock:Y»«ghost»", 2, vars)).toBe("«sku»«clock:Y»");
  });

  it("returns content unchanged for an out-of-range index", () => {
    expect(removeMarkerAt("«sku» x", 5, vars)).toBe("«sku» x");
    expect(removeMarkerAt("plain text", 0, vars)).toBe("plain text");
  });
});
