import { describe, it, expect } from "vitest";
import { tokeniseMarkers } from "./markerTokens";

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
    // brackets. `«»` therefore never tokenises as a marker — users
    // typing those glyphs literally don't get them coloured/treated
    // as a broken variable.
    expect(tokeniseMarkers("«»", vars)).toEqual([{ kind: "text", text: "«»" }]);
  });
});
