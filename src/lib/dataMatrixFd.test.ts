import { describe, it, expect } from "vitest";
import {
  DATAMATRIX_FD_ESCAPE,
  gs1ContentToDataMatrixFd,
  dataMatrixFdToGs1Content,
} from "./dataMatrixFd";
import { GS1_GS } from "./gs1";

describe("GS1 DataMatrix field data", () => {
  // (01)09501101530003(10)ABC123(21)12345 in raw model form (GS after the
  // non-last variable AI 10).
  const content = `010950110153000310ABC123${GS1_GS}2112345`;
  const fd = "_1010950110153000310ABC123_12112345";

  it("encodes a leading FNC1 and turns each GS into the escape sequence", () => {
    expect(gs1ContentToDataMatrixFd(content)).toBe(fd);
    expect(DATAMATRIX_FD_ESCAPE).toBe("_");
  });

  it("round-trips through the inverse", () => {
    expect(dataMatrixFdToGs1Content(fd, DATAMATRIX_FD_ESCAPE)).toBe(content);
  });

  it("returns null when field data has no leading FNC1 (non-GS1)", () => {
    expect(dataMatrixFdToGs1Content("1234567890", "_")).toBeNull();
  });

  it("strips a trailing GS so no dangling FNC1 is emitted", () => {
    expect(gs1ContentToDataMatrixFd(`0109501101530003${GS1_GS}`)).toBe("_10109501101530003");
  });

  it("doubles a literal escape char in data and round-trips it", () => {
    // AI 21 serial legitimately contains the escape sequence `_1`.
    const c = "010950110153000310LOT_1";
    const enc = gs1ContentToDataMatrixFd(c);
    expect(enc).toBe("_1010950110153000310LOT__1");
    expect(dataMatrixFdToGs1Content(enc, DATAMATRIX_FD_ESCAPE)).toBe(c);
  });

  it("decodes the _dNNN ASCII escape (foreign generators emit _d029 for GS)", () => {
    expect(dataMatrixFdToGs1Content("_1010950110153000310ABC123_d0292112345", "_"))
      .toBe(content);
    // A doubled escape before `d` stays a literal, not a decimal escape.
    expect(dataMatrixFdToGs1Content("_1010950110153000310__d029", "_"))
      .toBe("010950110153000310_d029");
  });

  it("leaves _dNNN above 255 verbatim (outside the ZPL byte-escape domain)", () => {
    expect(dataMatrixFdToGs1Content("_10109501101530003_d300", "_"))
      .toBe("0109501101530003_d300");
  });

  it("re-encodes a decoded control byte as _dNNN instead of a raw byte", () => {
    const c = `0109501101530003\x04`;
    expect(gs1ContentToDataMatrixFd(c)).toBe("_10109501101530003_d004");
    expect(dataMatrixFdToGs1Content("_10109501101530003_d004", "_")).toBe(c);
  });

  it("high bytes (0x80-0xFF) round-trip symmetrically as _dNNN", () => {
    const c = `0109501101530003\xc8`; // 0xC8 = 200
    expect(gs1ContentToDataMatrixFd(c)).toBe("_10109501101530003_d200");
    expect(dataMatrixFdToGs1Content("_10109501101530003_d200", "_")).toBe(c);
  });

  it("leaves a code point above 255 verbatim (a 3-digit _dNNN can't hold it)", () => {
    const c = "0109501101530003Ϩ"; // U+03E8, code point 1000
    // Not escaped to _d1000 (which decode would misread as 'd0').
    expect(gs1ContentToDataMatrixFd(c)).toBe("_10109501101530003Ϩ");
    expect(dataMatrixFdToGs1Content(gs1ContentToDataMatrixFd(c), "_")).toBe(c);
  });
});
