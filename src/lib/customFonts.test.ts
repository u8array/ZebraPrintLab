import { describe, it, expect } from "vitest";
import {
  nextFreeAlias,
  normalizeAlias,
  upsertCustomFontMapping,
} from "./customFonts";

describe("normalizeAlias", () => {
  it("uppercases letters", () => {
    expect(normalizeAlias("m")).toBe("M");
  });

  it("strips non-alphanumeric characters", () => {
    expect(normalizeAlias("!@#")).toBe("");
    expect(normalizeAlias(" m ")).toBe("M");
  });

  it("keeps only the first valid character", () => {
    expect(normalizeAlias("ab")).toBe("A");
    expect(normalizeAlias("#7q")).toBe("7");
  });

  it("accepts digits", () => {
    expect(normalizeAlias("0")).toBe("0");
  });
});

describe("upsertCustomFontMapping", () => {
  it("appends a new mapping when path is absent", () => {
    expect(
      upsertCustomFontMapping(
        [{ alias: "A", path: "E:A.TTF" }],
        "E:B.TTF",
        "B",
      ),
    ).toEqual([
      { alias: "A", path: "E:A.TTF" },
      { alias: "B", path: "E:B.TTF" },
    ]);
  });

  it("replaces an existing mapping for the same path", () => {
    expect(
      upsertCustomFontMapping(
        [{ alias: "A", path: "E:FOO.TTF" }],
        "E:FOO.TTF",
        "M",
      ),
    ).toEqual([{ alias: "M", path: "E:FOO.TTF" }]);
  });

  it("removes the mapping when alias is empty", () => {
    expect(
      upsertCustomFontMapping(
        [
          { alias: "A", path: "E:A.TTF" },
          { alias: "B", path: "E:B.TTF" },
        ],
        "E:A.TTF",
        "",
      ),
    ).toEqual([{ alias: "B", path: "E:B.TTF" }]);
  });

  it("treats undefined list as empty", () => {
    expect(upsertCustomFontMapping(undefined, "E:X.TTF", "X")).toEqual([
      { alias: "X", path: "E:X.TTF" },
    ]);
  });
});

describe("nextFreeAlias", () => {
  it("returns I when nothing is taken (first non-built-in)", () => {
    expect(nextFreeAlias([])).toBe("I");
  });

  it("skips taken aliases in the preferred range", () => {
    expect(nextFreeAlias(["I", "J", "K"])).toBe("L");
  });

  it("avoids built-in font letters until the unreserved range is exhausted", () => {
    // I-Z + 1-9 = 26 chars; if all are taken the helper falls back to
    // the built-in letters.
    const taken = "IJKLMNOPQRSTUVWXYZ123456789".split("");
    expect(nextFreeAlias(taken)).toBe("0");
  });

  it("returns empty when all 36 valid characters are taken", () => {
    const all =
      "0ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789".split("");
    expect(nextFreeAlias(all)).toBe("");
  });
});
