import { describe, it, expect } from "vitest";
import { zlibSync } from "fflate";
import {
  buildPrinterPreviewZpl,
  decodeDyGraphic,
  monoToRgba,
  type PrinterBitmap,
} from "./zebraGraphic";

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

// A 16x2 GRF: row0 = 0x80,0x01 (leftmost + rightmost bit set), row1 = 0xFF,0x00.
const MONO = new Uint8Array([0x80, 0x01, 0xff, 0x00]);
const BPR = 2;

const dyResponse = (mono: Uint8Array, kind: "Z" | "B", wrap = false): string => {
  const payload = kind === "Z" ? zlibSync(mono) : mono;
  let body = b64(payload);
  if (wrap) body = body.replace(/(.{4})/g, "$1\r\n"); // mimic printer line wrapping
  return `~DYPRE,A,G,${mono.length},${BPR},:${kind}64:${body}:5A3C\r\n`;
};

describe("buildPrinterPreviewZpl", () => {
  it("injects ^IS before the final ^XZ and appends the ^HY upload", () => {
    const out = buildPrinterPreviewZpl("^XA^FO10,10^A0N,30^FDHi^FS^XZ");
    expect(out).toContain("^ISR:PRE.GRF,N^XZ");
    expect(out).toContain("^HYR:PRE.GRF");
    expect(out.indexOf("^ISR:PRE.GRF")).toBeLessThan(out.indexOf("^HYR:PRE.GRF"));
  });

  it("appends ^IS even when the design has no trailing ^XZ", () => {
    expect(buildPrinterPreviewZpl("^XA^FDx^FS")).toContain("^ISR:PRE.GRF,N^XZ");
  });
});

describe("decodeDyGraphic", () => {
  it("decodes a Z64 (zlib) graphic upload round-trip", () => {
    const bmp = decodeDyGraphic(dyResponse(MONO, "Z"));
    expect(bmp).not.toBeNull();
    expect(bmp!.width).toBe(16);
    expect(bmp!.height).toBe(2);
    expect(Array.from(bmp!.mono)).toEqual(Array.from(MONO));
  });

  it("decodes a B64 (uncompressed) graphic upload", () => {
    const bmp = decodeDyGraphic(dyResponse(MONO, "B"));
    expect(Array.from(bmp!.mono)).toEqual(Array.from(MONO));
  });

  it("tolerates the printer's CRLF line-wrapping inside the base64 payload", () => {
    const bmp = decodeDyGraphic(dyResponse(MONO, "Z", true));
    expect(bmp).not.toBeNull();
    expect(Array.from(bmp!.mono)).toEqual(Array.from(MONO));
  });

  it("ignores trailing content after the ~DY (no CRC over-capture)", () => {
    // A status line the printer appends must not have its colon mistaken for
    // the CRC separator (regression: lastIndexOf would over-capture the payload).
    const bmp = decodeDyGraphic(dyResponse(MONO, "Z") + "\r\nHEAD TEMPERATURE: 25");
    expect(bmp).not.toBeNull();
    expect(Array.from(bmp!.mono)).toEqual(Array.from(MONO));
  });

  it("rejects a payload shorter than the declared byte count (truncated read)", () => {
    // Header claims 8 bytes (4 rows) but the payload only carries MONO (4).
    const resp = `~DYPRE,A,G,8,${BPR},:Z64:${b64(zlibSync(MONO))}:5A3C`;
    expect(decodeDyGraphic(resp)).toBeNull();
  });

  it("returns null when there is no ~DY graphic in the response", () => {
    expect(decodeDyGraphic("^XA^XZ")).toBeNull();
    expect(decodeDyGraphic("")).toBeNull();
  });
});

describe("monoToRgba", () => {
  it("maps set bits to black and clear bits to white", () => {
    const bmp: PrinterBitmap = { width: 16, height: 2, mono: MONO };
    const rgba = monoToRgba(bmp);
    // row0 pixel 0 (bit set) = black
    expect([rgba[0], rgba[1], rgba[2], rgba[3]]).toEqual([0, 0, 0, 255]);
    // row0 pixel 1 (bit clear) = white
    expect([rgba[4], rgba[5], rgba[6], rgba[7]]).toEqual([255, 255, 255, 255]);
    // row0 pixel 15 (rightmost bit set) = black
    const p15 = 15 * 4;
    expect([rgba[p15], rgba[p15 + 1], rgba[p15 + 2]]).toEqual([0, 0, 0]);
  });
});
