import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildBwipOptions, getDisplaySize, getEanUpcHriFragments, parseZplCode128Escapes } from "./bwipHelpers";
import type { LeafObject } from "../../registry";
type LabelObject = LeafObject;

describe("getEanUpcHriFragments", () => {
  it("returns the floated system digit left of the bars (negative module x)", () => {
    const frags = getEanUpcHriFragments("ean13", "5901234123457");
    expect(frags.length).toBe(13);
    expect(frags[0]?.char).toBe("5");
    expect(frags[0]?.xModule).toBeLessThan(0);
  });

  it("floats the UPC-A system digit left of the bars and the check digit right", () => {
    const frags = getEanUpcHriFragments("upca", "01234567890");
    expect(frags.length).toBe(12);
    expect(frags[0]?.xModule).toBeLessThan(0);
    expect(frags.at(-1)?.xModule).toBeGreaterThan(frags[10]!.xModule);
  });

  it("accepts 6-digit UPC-E content (system digit pre-padded)", () => {
    const frags = getEanUpcHriFragments("upce", "123456");
    expect(frags.length).toBeGreaterThan(0);
  });

  it("accepts the 8-digit UPC-E HRI form the canvas actually passes", () => {
    // App calls with formatUpceHri output (NS + 6 data + check).
    const frags = getEanUpcHriFragments("upce", "01234565");
    expect(frags.length).toBe(8);
  });
});

describe("rotation pipeline", () => {
  // Minimal code128 fixture; only the props used by buildBwipOptions/
  // getDisplaySize matter for these checks.
  const baseCode128 = (rotation: "N" | "R" | "I" | "B"): LabelObject =>
    ({
      id: "1",
      type: "code128",
      x: 0,
      y: 0,
      rotation: 0,
      props: {
        content: "ABC",
        height: 100,
        moduleWidth: 2,
        printInterpretation: false,
        checkDigit: false,
        rotation,
      },
    }) as LabelObject;

  it("never sets a bwip rotate option (Konva handles visual rotation)", () => {
    // bwip-js always renders upright now; the renderer wraps the
    // bitmap in an inner rotated Group via rotatedGroupTransform. A
    // rotate option in opts would double-rotate the result.
    for (const rot of ["N", "R", "I", "B"] as const) {
      expect(buildBwipOptions(baseCode128(rot), 1, 8)?.rotate).toBeUndefined();
    }
  });

  it("resolves UPC/EAN supplement bcid by content length", () => {
    const supplement = (content: string): LabelObject =>
      ({
        id: 's',
        type: 'upcEanExtension',
        x: 0,
        y: 0,
        rotation: 0,
        props: {
          content,
          height: 80,
          moduleWidth: 2,
          printInterpretation: true,
          checkDigit: false,
          rotation: 'N',
        },
      }) as LabelObject;
    // 2-digit content selects the ean2 bcid; everything else (5-digit,
    // empty fallback) renders as ean5.
    expect(buildBwipOptions(supplement('42'), 1, 8)?.bcid).toBe('ean2');
    expect(buildBwipOptions(supplement('51999'), 1, 8)?.bcid).toBe('ean5');
    expect(buildBwipOptions(supplement(''), 1, 8)?.bcid).toBe('ean5');
  });

  it("swaps display W and H for quarter rotations", () => {
    // bwip-js always produces an upright bitmap now; getDisplaySize
    // swaps W/H itself for R/B to report the rotated screen footprint.
    const uprightCanvas = { width: 200, height: 100 } as HTMLCanvasElement;
    const upright = getDisplaySize(baseCode128("N"), uprightCanvas, 1, 8);
    const rotR = getDisplaySize(baseCode128("R"), uprightCanvas, 1, 8);
    const rotB = getDisplaySize(baseCode128("B"), uprightCanvas, 1, 8);
    expect(rotR.w).toBe(upright.h);
    expect(rotR.h).toBe(upright.w);
    expect(rotB.w).toBe(upright.h);
    expect(rotB.h).toBe(upright.w);
  });

  it("leaves dimensions untouched for I (180°)", () => {
    const fakeCanvas = { width: 200, height: 100 } as HTMLCanvasElement;
    const upright = getDisplaySize(baseCode128("N"), fakeCanvas, 1, 8);
    const inverted = getDisplaySize(baseCode128("I"), fakeCanvas, 1, 8);
    expect(inverted).toEqual(upright);
  });
});

describe("getDisplaySize gs1databar sym 7 fallback", () => {
  // Sym 7 (Expanded Stacked) cannot be Labelary-cross-validated due to a
  // parens-AI input-format mismatch between bwip-js and Zebra firmware.
  // The implementation falls back to bwip-natural canvas height. This test
  // pins that behavior; any change must be intentional and accompanied
  // by a documented strategy for the missing ground truth.
  it("derives height from canvas dims (bwip-natural), not from a spec table", () => {
    const obj: LabelObject = {
      id: "1",
      type: "gs1databar",
      x: 0,
      y: 0,
      rotation: 0,
      props: {
        content: "0112345678901231",
        magnification: 2,
        symbology: 7,
        segments: 22,
        rotation: "N",
      },
    };
    // Canvas height varies per content+segments; we use a representative
    // value that bwip-js produced for a 16-char content at default
    // segments. The exact pixel size isn't load-bearing; what matters is
    // the formula, which derives from `ch`.
    const ch = 73;
    const cw = 100;
    const fakeCanvas = { width: cw, height: ch } as HTMLCanvasElement;
    const result = getDisplaySize(obj, fakeCanvas, 1, 8);
    // bwipSc = max(1, round(dotsToPx(2, 1, 8))) = round(0.25) = 1; modulePx = 0.25
    // h = (ch / 1) * 0.25 = 18.25
    expect(result.h).toBeCloseTo(18.25, 2);
  });
});

describe("buildBwipOptions gs1databar Expanded fallback", () => {
  // AI 01 + 11 numeric digits is not a valid GTIN-14 element string. Zebra
  // firmware emits General Compaction (~149 modules) rather than Method 1
  // padding. We route bwip-js through `(99)` so the rendered width matches.
  const obj = (content: string): LabelObject => ({
    id: "1",
    type: "gs1databar",
    x: 0,
    y: 0,
    rotation: 0,
    props: {
      content,
      magnification: 2,
      symbology: 6,
      segments: 22,
      rotation: "N",
    },
  });

  it("re-routes AI 01 + 11-digit fragment through (99) wrap", () => {
    const opts = buildBwipOptions(obj("0112345678901"), 1, 8);
    expect(opts?.text).toBe("(99)0112345678901");
  });

  it("keeps valid AI 01 GTIN-14 input on the standard wrap path", () => {
    const opts = buildBwipOptions(obj("0112345678901231"), 1, 8);
    expect(opts?.text).toBe("(01)12345678901231");
  });
});

describe("buildBwipOptions datamatrix GS1 mode", () => {
  const dm = (content: string, gs1: boolean): LabelObject => ({
    id: "1",
    type: "datamatrix",
    x: 0,
    y: 0,
    rotation: 0,
    props: { content, dimension: 5, quality: 200, rotation: "N", gs1 },
  });

  it("GS1 mode switches bcid and feeds the (AI) element string", () => {
    const opts = buildBwipOptions(dm("0109501101530003", true), 1, 8);
    expect(opts?.bcid).toBe("gs1datamatrix");
    expect(opts?.text).toBe("(01)09501101530003");
  });

  it("plain mode keeps the datamatrix bcid and raw content", () => {
    const opts = buildBwipOptions(dm("DM123", false), 1, 8);
    expect(opts?.bcid).toBe("datamatrix");
    expect(opts?.text).toBe("DM123");
  });
});

describe("getDisplaySize coverage (ZPL-first policy)", () => {
  // Static parse of bwipHelpers.ts: every barcode type registered via BCID
  // must have an explicit `case "type":` in getUprightDisplaySize, otherwise
  // the default fallback returns bwip-natural pixels and silently violates
  // the ZPL-first sizing policy.
  it("every BCID-registered type has an explicit case (no silent default)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "bwipHelpers.ts"), "utf-8");

    const bcidBlock = /const BCID:[^=]*=\s*\{([\s\S]*?)\};/.exec(src);
    expect(bcidBlock, "BCID literal not found in source").toBeTruthy();
    const bcidKeys = [...(bcidBlock?.[1] ?? "").matchAll(/^\s*(\w+):\s*"/gm)]
      .map((m) => m[1] ?? "");

    const fnBlock = /function getUprightDisplaySize\([\s\S]*?^\}/m.exec(src);
    expect(fnBlock, "getUprightDisplaySize body not found").toBeTruthy();
    const caseLabels = [...(fnBlock?.[0] ?? "").matchAll(/case "(\w+)":/g)]
      .map((m) => m[1] ?? "");

    const missing = bcidKeys.filter((k) => !caseLabels.includes(k));
    expect(missing, `Missing explicit case for: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("parseZplCode128Escapes", () => {
  it("returns null for plain ASCII (no escape sequences)", () => {
    expect(parseZplCode128Escapes("ABC123")).toBeNull();
    expect(parseZplCode128Escapes("")).toBeNull();
  });

  it("translates >5 to FNC1", () => {
    expect(parseZplCode128Escapes("AB>5CD")).toBe("AB^FNC1CD");
  });

  it("translates >9 to FNC1 only at the start of the field (per ZPL spec)", () => {
    expect(parseZplCode128Escapes(">91234")).toBe("^FNC11234");
    // Mid-string >9 is just a Code-C invocation; bwip auto-mode picks C
    // for the digit run, so we drop the escape entirely.
    expect(parseZplCode128Escapes("A>9123")).toBe("A123");
  });

  it("translates >6/>7/>8 to FNC2/FNC3/FNC4", () => {
    expect(parseZplCode128Escapes("A>6B")).toBe("A^FNC2B");
    expect(parseZplCode128Escapes("A>7B")).toBe("A^FNC3B");
    expect(parseZplCode128Escapes("A>8B")).toBe("A^FNC4B");
  });

  it("translates >0 to a literal `>`", () => {
    expect(parseZplCode128Escapes("A>0B>5")).toBe("A>B^FNC1");
  });

  it("drops >: and >; (subset switches — bwip auto-mode picks the subset)", () => {
    expect(parseZplCode128Escapes("A>:B>;C>5")).toBe("ABC^FNC1");
  });

  it("doubles literal `^` so bwip parsefnc does not treat it as an escape", () => {
    expect(parseZplCode128Escapes("A^B>5")).toBe("A^^B^FNC1");
  });

  it("leaves trailing `>` and unknown `>X` literal — matches firmware behaviour", () => {
    expect(parseZplCode128Escapes("abc>")).toBeNull();
    // `>z` is not a defined ZPL escape; Zebra treats it as literal `>z`.
    expect(parseZplCode128Escapes("a>z>5")).toBe("a>z^FNC1");
  });

  it("handles the reported case STRSTR>5… with auto Code-C compaction", () => {
    // Without translation: 21 raw Subset-B symbols.
    // After translation: bwip sees STRSTR + FNC1 + 16 digits, auto-switches
    // to Code C for the digit run → ~15 data symbols, matching firmware.
    expect(parseZplCode128Escapes("STRSTR>52316094000242201"))
      .toBe("STRSTR^FNC12316094000242201");
  });
});

describe("buildBwipOptions code128 escape handling", () => {
  const code128 = (content: string): LabelObject =>
    ({
      id: "1",
      type: "code128",
      x: 0,
      y: 0,
      rotation: 0,
      props: {
        content,
        height: 100,
        moduleWidth: 2,
        printInterpretation: false,
        checkDigit: false,
        rotation: "N",
      },
    }) as LabelObject;

  it("uses raw Subset-B mode for plain ASCII content (existing behaviour)", () => {
    const opts = buildBwipOptions(code128("ABC123"), 1, 8);
    expect(opts?.raw).toBe(true);
    expect(opts?.parsefnc).toBeUndefined();
    expect(typeof opts?.text).toBe("string");
    expect((opts?.text as string).startsWith("^104")).toBe(true);
  });

  it("switches to parsefnc auto-mode when ZPL escape sequences are present", () => {
    const opts = buildBwipOptions(code128("STRSTR>52316094000242201"), 1, 8);
    expect(opts?.parsefnc).toBe(true);
    expect(opts?.raw).toBeUndefined();
    expect(opts?.text).toBe("STRSTR^FNC12316094000242201");
  });
});

