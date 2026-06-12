import { describe, it, expect } from "vitest";
import { tokenizeZplLine, type ZplToken } from "./zplTokenize";

const compact = (line: string) =>
  tokenizeZplLine(line).map((t): [ZplToken["type"], string] => [t.type, t.value]);

describe("tokenizeZplLine", () => {
  it("splits a command from its numeric coordinates", () => {
    expect(compact("^FO176,171")).toEqual([
      ["command", "^FO"],
      ["number", "176"],
      ["separator", ","],
      ["number", "171"],
    ]);
  });

  it("does not let the command swallow following letters (^FDText bug)", () => {
    // Regression: the old regex matched ^FDT as one token, leaving "ext".
    expect(compact("^FDText")).toEqual([
      ["command", "^FD"],
      ["fieldData", "Text"],
    ]);
  });

  it("treats digits inside field data as content, not numbers", () => {
    expect(compact("^FD01234567890")).toEqual([
      ["command", "^FD"],
      ["fieldData", "01234567890"],
    ]);
  });

  it("keeps commas inside field data as part of the payload", () => {
    expect(compact("^FDhello, world")).toEqual([
      ["command", "^FD"],
      ["fieldData", "hello, world"],
    ]);
  });

  it("marks ^XA and ^XZ as structural", () => {
    expect(compact("^XA")).toEqual([["structural", "^XA"]]);
    expect(compact("^XZ")).toEqual([["structural", "^XZ"]]);
  });

  it("separates flags from numbers in a barcode command", () => {
    expect(compact("^BUN,100,Y,N,Y")).toEqual([
      ["command", "^BU"],
      ["enum", "N"],
      ["separator", ","],
      ["number", "100"],
      ["separator", ","],
      ["enum", "Y"],
      ["separator", ","],
      ["enum", "N"],
      ["separator", ","],
      ["enum", "Y"],
    ]);
  });

  it("takes exactly two characters as the command code (^A0)", () => {
    expect(compact("^A0N,30,0")).toEqual([
      ["command", "^A0"],
      ["enum", "N"],
      ["separator", ","],
      ["number", "30"],
      ["separator", ","],
      ["number", "0"],
    ]);
  });

  it("handles decimal parameters", () => {
    expect(compact("^BY2,2.5,100")).toEqual([
      ["command", "^BY"],
      ["number", "2"],
      ["separator", ","],
      ["number", "2.5"],
      ["separator", ","],
      ["number", "100"],
    ]);
  });

  it("classifies a leading-dot decimal as a number", () => {
    expect(compact("^XY.5,2.0")).toEqual([
      ["command", "^XY"],
      ["number", ".5"],
      ["separator", ","],
      ["number", "2.0"],
    ]);
  });

  it("colours ^FX content as a comment", () => {
    expect(compact("^FXsection break")).toEqual([
      ["command", "^FX"],
      ["comment", "section break"],
    ]);
  });

  it("recognises tilde commands", () => {
    const tokens = compact("~DGR:LOGO.GRF,8000,20");
    expect(tokens[0]).toEqual(["command", "~DG"]);
  });

  it("tokenizes a full multi-command line", () => {
    expect(compact("^BY2^FO176,171^BUN,100,Y,N,Y^FD01234567890^FS")).toEqual([
      ["command", "^BY"],
      ["number", "2"],
      ["command", "^FO"],
      ["number", "176"],
      ["separator", ","],
      ["number", "171"],
      ["command", "^BU"],
      ["enum", "N"],
      ["separator", ","],
      ["number", "100"],
      ["separator", ","],
      ["enum", "Y"],
      ["separator", ","],
      ["enum", "N"],
      ["separator", ","],
      ["enum", "Y"],
      ["command", "^FD"],
      ["fieldData", "01234567890"],
      ["command", "^FS"],
    ]);
  });

  it("returns no tokens for an empty line", () => {
    expect(compact("")).toEqual([]);
  });

  it("emits leading non-command text as text", () => {
    expect(compact("  ^FS")).toEqual([
      ["text", "  "],
      ["command", "^FS"],
    ]);
  });

  it("reconstructs the original line from token values", () => {
    const line = "^BY2^FO176,171^BUN,100,Y,N,Y^FD01234567890^FS";
    expect(tokenizeZplLine(line).map((t) => t.value).join("")).toBe(line);
  });
});
