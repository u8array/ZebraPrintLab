import { describe, it, expect } from "vitest";
import { buildBlockOverlay, overlayText, type LinkedSpan } from "./overlay";

describe("buildBlockOverlay", () => {
  const src = "^XA\n^FO10,10^FDa^FS\n^FO10,50^FDb^FS\n^XZ";
  const f1s = src.indexOf("^FO10,10");
  const f1e = src.indexOf("^FS") + 3;
  const f2s = src.indexOf("^FO10,50");
  const f2e = src.indexOf("^FS", f2s) + 3;
  const spans: LinkedSpan[] = [
    { start: f1s, end: f1e, link: { kind: "object", objectId: "a" } },
    { start: f2s, end: f2e, link: { kind: "object", objectId: "b" } },
  ];

  const opts = { regenSafe: true } as const;

  it("fills gaps with raw and preserves the concat invariant", () => {
    const o = buildBlockOverlay(src, spans, opts);
    expect(overlayText(o)).toBe(src);
    expect(o.segments.map((s) => s.kind)).toEqual(["raw", "object", "raw", "object", "raw"]);
    expect(o.segments[1]).toMatchObject({ kind: "object", objectId: "a", text: "^FO10,10^FDa^FS" });
  });

  it("sorts unordered spans", () => {
    const o = buildBlockOverlay(src, [spans[1]!, spans[0]!], opts);
    expect(overlayText(o)).toBe(src);
  });

  it("carries regenSafe and an optional frame", () => {
    const o = buildBlockOverlay(src, spans, { regenSafe: false, frame: { homeX: 50, homeY: 10, top: 5 } });
    expect(o.regenSafe).toBe(false);
    expect(o.frame).toEqual({ homeX: 50, homeY: 10, top: 5 });
    const o2 = buildBlockOverlay(src, spans, opts);
    expect(o2.regenSafe).toBe(true);
    expect(o2.frame).toBeUndefined();
  });

  it("links a config span and keeps leading/trailing raw", () => {
    const s2 = "^XA^PW800^FO0,0^FDx^FS^XZ";
    const cs = s2.indexOf("^PW800");
    const fs = s2.indexOf("^FO0,0");
    const o = buildBlockOverlay(s2, [
      { start: cs, end: cs + "^PW800".length, link: { kind: "config", field: "widthMm" } },
      { start: fs, end: s2.indexOf("^FS") + 3, link: { kind: "object", objectId: "x" } },
    ], opts);
    expect(overlayText(o)).toBe(s2);
    expect(o.segments.find((s) => s.kind === "config")).toMatchObject({ field: "widthMm", text: "^PW800" });
  });

  it("throws on overlapping spans", () => {
    expect(() =>
      buildBlockOverlay("^XA^FDa^FS^XZ", [
        { start: 0, end: 6, link: { kind: "object", objectId: "a" } },
        { start: 3, end: 9, link: { kind: "object", objectId: "b" } },
      ], opts),
    ).toThrow();
  });
});
