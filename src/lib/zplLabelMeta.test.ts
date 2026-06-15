import { describe, it, expect } from "vitest";
import {
  formatLabelMetaComment,
  parseLabelMetaComment,
  LABEL_META_PREFIX,
} from "./zplLabelMeta";

describe("zplLabelMeta", () => {
  it("round-trips dpmm/width/height through format → parse", () => {
    const meta = { dpmm: 12, widthMm: 57, heightMm: 32 };
    const line = formatLabelMetaComment(meta);
    expect(line).toBe(`^FX${LABEL_META_PREFIX}{"dpmm":12,"wMm":57,"hMm":32}^FS`);
    // parse consumes the comment BODY (text after ^FX), before the ^FS.
    expect(parseLabelMetaComment(line.slice(3, line.length - 3))).toEqual(meta);
  });

  it("emits a caret/tilde-free comment body (spec-safe inside ^FX)", () => {
    const line = formatLabelMetaComment({ dpmm: 8, widthMm: 100, heightMm: 60 });
    expect(line.slice(3, line.length - 3)).not.toMatch(/[\^~]/);
  });

  it("returns null for a non-sentinel comment", () => {
    expect(parseLabelMetaComment("a human note")).toBeNull();
    expect(parseLabelMetaComment("")).toBeNull();
  });

  it("returns null for malformed JSON after the prefix", () => {
    expect(parseLabelMetaComment(`${LABEL_META_PREFIX}{not json`)).toBeNull();
  });

  it("rejects an out-of-set dpmm", () => {
    expect(
      parseLabelMetaComment(`${LABEL_META_PREFIX}{"dpmm":10,"wMm":100,"hMm":60}`),
    ).toBeNull();
  });

  it("rejects out-of-range or non-numeric mm", () => {
    expect(
      parseLabelMetaComment(`${LABEL_META_PREFIX}{"dpmm":8,"wMm":0,"hMm":60}`),
    ).toBeNull();
    expect(
      parseLabelMetaComment(`${LABEL_META_PREFIX}{"dpmm":8,"wMm":100,"hMm":99999}`),
    ).toBeNull();
    expect(
      parseLabelMetaComment(`${LABEL_META_PREFIX}{"dpmm":8,"wMm":"x","hMm":60}`),
    ).toBeNull();
  });

  it("tolerates surrounding whitespace on the body", () => {
    expect(
      parseLabelMetaComment(`  ${LABEL_META_PREFIX}{"dpmm":8,"wMm":100,"hMm":60}  `),
    ).toEqual({ dpmm: 8, widthMm: 100, heightMm: 60 });
  });
});
