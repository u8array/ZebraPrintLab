import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  generateSetupScript,
  SETUP_SCRIPT_FIELDS,
  __SETUP_SCRIPT_EMITTERS_FOR_TESTS,
} from "./zplSetupScript";
import { parseZPL } from "./zplParser";
import { printerProfileSchema, type PrinterProfile } from "../types/PrinterProfile";

const base: PrinterProfile = {};

describe("generateSetupScript — output shape", () => {
  it("returns empty string when no Setup-Script field is set", () => {
    expect(generateSetupScript(base)).toBe("");
  });

  it("emits tilde-prefix commands standalone (no wrapper block) with 3-digit ~TA padding", () => {
    // ~TA requires 3-digit magnitude per spec; firmware silently
    // ignores shorter forms ("~TA10" is dropped, "~TA010" is honored).
    const script = generateSetupScript({ ...base, tearOffAdjust: 10 });
    expect(script).toBe("~TA010");
  });

  it("pads ~TA magnitude with the sign outside the 3-digit field", () => {
    expect(generateSetupScript({ ...base, tearOffAdjust: 5 })).toBe("~TA005");
    expect(generateSetupScript({ ...base, tearOffAdjust: -5 })).toBe("~TA-005");
    expect(generateSetupScript({ ...base, tearOffAdjust: 120 })).toBe("~TA120");
    expect(generateSetupScript({ ...base, tearOffAdjust: -120 })).toBe("~TA-120");
    expect(generateSetupScript({ ...base, tearOffAdjust: 0 })).toBe("~TA000");
  });

  it("wraps caret-prefix commands in a ^XA...^XZ block", () => {
    const script = generateSetupScript({ ...base, reprintAfterError: "N" });
    expect(script).toBe("^XA\n^JZN\n^XZ");
  });

  it("combines tilde lines above the caret block", () => {
    const script = generateSetupScript({
      ...base,
      tearOffAdjust: -5,
      reprintAfterError: "Y",
      headTestInterval: 100,
    });
    expect(script).toBe("~TA-005\n^XA\n^JZY\n^JT100\n^XZ");
  });

  it("omits the wrapper block when only tilde commands are set", () => {
    const script = generateSetupScript({ ...base, tearOffAdjust: 0 });
    expect(script).not.toContain("^XA");
    expect(script).not.toContain("^XZ");
  });

  it("emits ^ST with the six positional params in MM,DD,YYYY,HH,MM,SS order", () => {
    const script = generateSetupScript({
      ...base,
      setRealtimeClock: "2026-05-29T18:30:00",
    });
    expect(script).toBe("^XA\n^ST05,29,2026,18,30,00\n^XZ");
  });

  it("defaults ^ST seconds to 00 when datetime-local omits them", () => {
    const script = generateSetupScript({
      ...base,
      setRealtimeClock: "2026-05-29T18:30",
    });
    expect(script).toContain("^ST05,29,2026,18,30,00");
  });

  it("skips ^ST emit silently when the value is unparsable", () => {
    const script = generateSetupScript({
      ...base,
      setRealtimeClock: "not-a-datetime",
    });
    expect(script).toBe("");
  });

  describe("^ST live mode (useCurrentTimeForClock)", () => {
    beforeEach(() => {
      // Local fields: May 30 2026 18:30:45 in whatever TZ the host
      // is in — toLocalIsoString reads getFullYear/etc, so the
      // assertion is TZ-independent.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 30, 18, 30, 45));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("emits ^ST with the current wall-clock time when live mode is on", () => {
      const script = generateSetupScript({ ...base, useCurrentTimeForClock: true });
      expect(script).toBe("^XA\n^ST05,30,2026,18,30,45\n^XZ");
    });

    it("live mode wins over a stored static value", () => {
      const script = generateSetupScript({
        ...base,
        useCurrentTimeForClock: true,
        setRealtimeClock: "2020-01-01T00:00:00",
      });
      expect(script).toBe("^XA\n^ST05,30,2026,18,30,45\n^XZ");
    });

    it("falls back to the static value when live mode is off", () => {
      const script = generateSetupScript({
        ...base,
        useCurrentTimeForClock: false,
        setRealtimeClock: "2020-01-01T00:00:00",
      });
      expect(script).toBe("^XA\n^ST01,01,2020,00,00,00\n^XZ");
    });
  });

  it("emits ^KD with the selected clock-format code", () => {
    const script = generateSetupScript({ ...base, clockFormat: "2" });
    expect(script).toBe("^XA\n^KD2\n^XZ");
  });

  it("round-trips ^ST + ^KD via the parser without loss", () => {
    const orig: PrinterProfile = {
      ...base,
      setRealtimeClock: "2026-05-29T18:30:45",
      clockFormat: "3",
    };
    const { printerProfile: parsed } = parseZPL(generateSetupScript(orig));
    expect(parsed.setRealtimeClock).toBe("2026-05-29T18:30:45");
    expect(parsed.clockFormat).toBe("3");
  });

  it("rejects ^KD with an unknown format code", () => {
    expect(parseZPL("^XA^KD9^XZ").printerProfile.clockFormat).toBeUndefined();
  });

  it("rejects ^ST with malformed positional params", () => {
    expect(parseZPL("^XA^ST05,29,26,18,30,00^XZ").printerProfile.setRealtimeClock).toBeUndefined();
    expect(parseZPL("^XA^ST05,29,2026,18,30^XZ").printerProfile.setRealtimeClock).toBeUndefined();
  });

  it("emits ^KL with the selected printer locale", () => {
    expect(generateSetupScript({ ...base, printerLocale: "DE" })).toBe("^XA\n^KLDE\n^XZ");
  });

  it("emits ^SE with the encoding-table file path", () => {
    expect(generateSetupScript({ ...base, encodingTable: "E:UHANGUL.DAT" }))
      .toBe("^XA\n^SEE:UHANGUL.DAT\n^XZ");
  });

  it("rejects empty-string encodingTable at the schema layer", () => {
    // The schema's min(1) makes empty string unreachable through
    // printerProfileSchema.parse, so the generator no longer carries
    // its own empty-string defense. This test pins the schema
    // contract so a future schema loosening would also surface here.
    expect(() => printerProfileSchema.parse({ ...base, encodingTable: "" })).toThrow();
  });

  it("emits ^SZ with the selected ZPL mode", () => {
    expect(generateSetupScript({ ...base, zplMode: "1" })).toBe("^XA\n^SZ1\n^XZ");
    expect(generateSetupScript({ ...base, zplMode: "2" })).toBe("^XA\n^SZ2\n^XZ");
  });

  it("round-trips ^KL + ^SE + ^SZ via the parser without loss", () => {
    const orig: PrinterProfile = {
      ...base,
      printerLocale: "JP",
      encodingTable: "E:UHANGUL.DAT",
      zplMode: "2",
    };
    const { printerProfile: parsed } = parseZPL(generateSetupScript(orig));
    expect(parsed.printerLocale).toBe("JP");
    expect(parsed.encodingTable).toBe("E:UHANGUL.DAT");
    expect(parsed.zplMode).toBe("2");
  });

  it("round-trips the 3-char SP2 printer-locale code", () => {
    // SP2 is the only non-2-char alpha code in PRINTER_LOCALE_VALUES;
    // pin its round-trip so a future regex tightening of the parser
    // (e.g. assuming 2-char codes) breaks here loudly.
    const { printerProfile: parsed } = parseZPL(generateSetupScript({ ...base, printerLocale: "SP2" }));
    expect(parsed.printerLocale).toBe("SP2");
  });

  it("preserves spaces inside ^SE encoding-table paths", () => {
    // Hand-edited ZPL can carry paths with spaces (e.g.
    // `E:MY FILE.DAT`). The parser must not mangle them.
    const path = "E:MY FILE.DAT";
    const { printerProfile: parsed } = parseZPL(generateSetupScript({ ...base, encodingTable: path }));
    expect(parsed.encodingTable).toBe(path);
  });

  it("rejects ZPL injection attempts in ^SE values at the schema layer", () => {
    // `^SE${value}` interpolation makes this a real injection
    // surface for imported / pasted ZPL. Schema must reject any
    // value carrying the command-introducer chars.
    expect(() => printerProfileSchema.parse({ ...base, encodingTable: "^SDXY" })).toThrow();
    expect(() => printerProfileSchema.parse({ ...base, encodingTable: "E:F.DAT~JR" })).toThrow();
    expect(() => printerProfileSchema.parse({ ...base, encodingTable: "E:F.DAT\n^MD30" })).toThrow();
  });

  it("emits ^KN with name only when description is unset", () => {
    expect(generateSetupScript({ ...base, printerName: "Lab-01" }))
      .toBe("^XA\n^KNLab-01\n^XZ");
  });

  it("folds ^KN description into the same line when both are set", () => {
    expect(generateSetupScript({ ...base, printerName: "Lab-01", printerDescription: "front desk" }))
      .toBe("^XA\n^KNLab-01,front desk\n^XZ");
  });

  it("skips ^KN emit when only the description is set (name is the anchor)", () => {
    expect(generateSetupScript({ ...base, printerDescription: "orphan" })).toBe("");
  });

  it("skips ^KN emit when name is whitespace-only after trim", () => {
    // Schema's min(1) accepts "   "; the emit-side trim-guard
    // prevents an empty ^KN from going out and silently dropping
    // both fields on re-import.
    expect(generateSetupScript({ ...base, printerName: "   " })).toBe("");
    expect(generateSetupScript({ ...base, printerName: "   ", printerDescription: "desc" }))
      .toBe("");
  });

  it("round-trips ^KN via the parser without loss", () => {
    const orig: PrinterProfile = {
      ...base,
      printerName: "Lab-01",
      printerDescription: "front desk",
    };
    const { printerProfile: parsed } = parseZPL(generateSetupScript(orig));
    expect(parsed.printerName).toBe("Lab-01");
    expect(parsed.printerDescription).toBe("front desk");
  });

  it("rejects ZPL injection attempts in ^KN values at the schema layer", () => {
    expect(() => printerProfileSchema.parse({ ...base, printerName: "^SD30" })).toThrow();
    expect(() => printerProfileSchema.parse({ ...base, printerDescription: "front\n^MD0" })).toThrow();
  });

  it("rejects ^KN names longer than the 16-char spec cap", () => {
    expect(() => printerProfileSchema.parse({ ...base, printerName: "abcdefghij0123456" })).toThrow();
  });

  it("emits ^KP for a 4-digit password", () => {
    expect(generateSetupScript({ ...base, setPassword: "4711" }))
      .toBe("^XA\n^KP4711\n^XZ");
  });

  it("preserves ^KP0000 (the disable-protection value)", () => {
    expect(generateSetupScript({ ...base, setPassword: "0000" }))
      .toBe("^XA\n^KP0000\n^XZ");
  });

  it("schema rejects non-4-digit passwords", () => {
    expect(() => printerProfileSchema.parse({ ...base, setPassword: "123" })).toThrow();
    expect(() => printerProfileSchema.parse({ ...base, setPassword: "12345" })).toThrow();
    expect(() => printerProfileSchema.parse({ ...base, setPassword: "abcd" })).toThrow();
  });

  it("round-trips ^KP via the parser", () => {
    const { printerProfile: parsed } = parseZPL("^XA^KP9876^XZ");
    expect(parsed.setPassword).toBe("9876");
  });

  it("parser rejects ^KP values that don't match the 4-digit shape", () => {
    expect(parseZPL("^XA^KP12^XZ").printerProfile.setPassword).toBeUndefined();
    expect(parseZPL("^XA^KP12A4^XZ").printerProfile.setPassword).toBeUndefined();
  });

  it("emits ^JU{action} for each spec value", () => {
    expect(generateSetupScript({ ...base, configurationUpdate: "S" }))
      .toBe("^XA\n^JUS\n^XZ");
    expect(generateSetupScript({ ...base, configurationUpdate: "R" }))
      .toBe("^XA\n^JUR\n^XZ");
    expect(generateSetupScript({ ...base, configurationUpdate: "N" }))
      .toBe("^XA\n^JUN\n^XZ");
    expect(generateSetupScript({ ...base, configurationUpdate: "F" }))
      .toBe("^XA\n^JUF\n^XZ");
  });

  it("places ^JU last in the block so ^JUS commits everything before it", () => {
    const script = generateSetupScript({
      ...base,
      setPassword: "4711",
      printerName: "lab-01",
      configurationUpdate: "S",
    });
    const lines = script.split("\n");
    expect(lines[lines.length - 2]).toBe("^JUS");
    expect(lines[lines.length - 1]).toBe("^XZ");
  });

  it("round-trips ^JU via the parser", () => {
    for (const action of ["S", "R", "N", "F"] as const) {
      const { printerProfile: parsed } = parseZPL(`^XA^JU${action}^XZ`);
      expect(parsed.configurationUpdate).toBe(action);
    }
  });

  it("parser rejects ^JU with an unknown action letter", () => {
    expect(parseZPL("^XA^JUX^XZ").printerProfile.configurationUpdate).toBeUndefined();
  });

  it("emits ^SL with mode S only when language is unset", () => {
    expect(generateSetupScript({ ...base, clockMode: "S" })).toBe("^XA\n^SLS\n^XZ");
  });

  it("emits ^SL with mode T plus language when both set", () => {
    expect(generateSetupScript({ ...base, clockMode: "T", clockLanguage: "4" }))
      .toBe("^XA\n^SLT,4\n^XZ");
  });

  it("emits ^SL with numeric tolerance when mode is TOL", () => {
    expect(generateSetupScript({ ...base, clockMode: "TOL", clockTolerance: 60, clockLanguage: "1" }))
      .toBe("^XA\n^SL60,1\n^XZ");
  });

  it("schema rejects clockMode='TOL' without clockTolerance (cross-field rule)", () => {
    expect(() => printerProfileSchema.parse({ ...base, clockMode: "TOL" })).toThrow();
  });

  it("schema rejects clockTolerance set under non-TOL mode (cross-field rule)", () => {
    expect(() => printerProfileSchema.parse({ ...base, clockMode: "S", clockTolerance: 60 })).toThrow();
  });

  it("skips ^SL emit when only language or tolerance is set without mode anchor", () => {
    expect(generateSetupScript({ ...base, clockLanguage: "4" })).toBe("");
    expect(generateSetupScript({ ...base, clockTolerance: 60 })).toBe("");
  });

  it("round-trips ^SL S/T/TOL modes via the parser", () => {
    for (const orig of [
      { ...base, clockMode: "S" as const },
      { ...base, clockMode: "T" as const, clockLanguage: "4" as const },
      { ...base, clockMode: "TOL" as const, clockTolerance: 90, clockLanguage: "1" as const },
    ]) {
      const { printerProfile: parsed } = parseZPL(generateSetupScript(orig));
      expect(parsed.clockMode).toBe(orig.clockMode);
      if (orig.clockMode === "TOL") expect(parsed.clockTolerance).toBe(orig.clockTolerance);
      if ("clockLanguage" in orig) expect(parsed.clockLanguage).toBe(orig.clockLanguage);
    }
  });

  it("parses bare ^SL with no params as a no-op (no field set)", () => {
    const { printerProfile: parsed } = parseZPL("^XA^SL^XZ");
    expect(parsed.clockMode).toBeUndefined();
    expect(parsed.clockLanguage).toBeUndefined();
  });

  it("drops ^SL with out-of-range tolerance or unknown language", () => {
    expect(parseZPL("^XA^SL1500,1^XZ").printerProfile.clockMode).toBeUndefined();
    expect(parseZPL("^XA^SLS,99^XZ").printerProfile.clockLanguage).toBeUndefined();
  });

  it("clears stale clockTolerance when a later ^SL parses to mode S/T", () => {
    // Schema's cross-field rule forbids `tolerance set while mode in
    // {S, T}`. Parser writes raw values, so without the clear a
    // second ^SL parse would leave the store in an un-saveable
    // state. `^SL60,1^SLS` mid-stream is the realistic scenario.
    const zpl = "^XA^SL60,1^XZ^XA^SLS^XZ";
    const { printerProfile } = parseZPL(zpl);
    expect(printerProfile.clockMode).toBe("S");
    expect(printerProfile.clockTolerance).toBeUndefined();
  });

  it("does not orphan-set clockLanguage when the mode parse drops", () => {
    // Without the mode guard, `^SL1500,1` would set
    // clockLanguage='1' while clockMode stays undefined — emit
    // would then drop the orphan language silently, making it
    // write-only state. Pin the guard.
    expect(parseZPL("^XA^SL1500,1^XZ").printerProfile.clockLanguage).toBeUndefined();
  });

  it("rejects commas in ^KN / ^SE free-string fields (would round-trip-split)", () => {
    expect(() => printerProfileSchema.parse({ ...base, printerName: "Lab,01" })).toThrow();
    expect(() => printerProfileSchema.parse({ ...base, printerDescription: "front,desk" })).toThrow();
    expect(() => printerProfileSchema.parse({ ...base, encodingTable: "E:F.DAT,extra" })).toThrow();
  });

  it("parser drops ^SE values carrying ZPL command-introducer chars", () => {
    // The parser writes into the store without re-running the
    // schema; the dangerous-char check mirrors the schema so an
    // import cannot smuggle an injection past it.
    expect(parseZPL("^XA^SE\x1bbad^XZ").printerProfile.encodingTable).toBeUndefined();
  });

  it("rejects ^KL with an unknown locale code", () => {
    expect(parseZPL("^XA^KLXX^XZ").printerProfile.printerLocale).toBeUndefined();
  });

  it("rejects ^SZ with an unknown mode", () => {
    expect(parseZPL("^XA^SZ9^XZ").printerProfile.zplMode).toBeUndefined();
  });

  it("declares its channel-field set as a SSoT (SETUP_SCRIPT_FIELDS)", () => {
    // Guards against the if-chain in generateSetupScript silently
    // drifting from the documented registry. If a new Setup-Script
    // command is added, both the if-chain and SETUP_SCRIPT_FIELDS
    // must be updated together.
    expect([...SETUP_SCRIPT_FIELDS]).toEqual([
      "tearOffAdjust",
      "reprintAfterError",
      "headTestInterval",
      "setRealtimeClock",
      "useCurrentTimeForClock",
      "clockFormat",
      "printerLocale",
      "encodingTable",
      "zplMode",
      "printerName",
      "printerDescription",
      "setPassword",
      "clockMode",
      "clockTolerance",
      "clockLanguage",
      "configurationUpdate",
    ]);
  });

  it("places configurationUpdate as the last entry so ^JUS commits the block", () => {
    // Tripwire: ^JU emits whatever persistent writes precede it, so a
    // future field added after configurationUpdate would land inside
    // the same ^XA…^XZ block and only get committed on the next
    // print job, not at provisioning.
    expect(SETUP_SCRIPT_FIELDS[SETUP_SCRIPT_FIELDS.length - 1]).toBe(
      "configurationUpdate",
    );
  });

  it("PrinterProfile carries only Setup-Script fields — no per-label leakage", () => {
    // The schema must not accept per-label keys (^MD, ~SD, ^PR, ^MN
    // and friends). This pins the "no double-source-of-truth"
    // contract: per-label config stays on labelConfig.
    const result = printerProfileSchema.safeParse({
      ...base,
      darkness: 15,
      instantDarkness: 20,
      printSpeed: 6,
      mediaTracking: "Y",
    } as Record<string, unknown>);
    // Strict mode would error; default zod object strips unknown
    // keys silently. Verify the parsed result doesn't carry them.
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("darkness");
      expect(result.data).not.toHaveProperty("instantDarkness");
      expect(result.data).not.toHaveProperty("printSpeed");
      expect(result.data).not.toHaveProperty("mediaTracking");
    }
  });
});

describe("SETUP_SCRIPT_EMITTERS structural invariants", () => {
  it("every foldedInto.target points at a kind:'emit' entry, never another foldedInto", () => {
    // A target chain (foldedInto → foldedInto) would mean no entry
    // actually produces the wire command — the registry would compile
    // but the emit channel would silently drop. This test catches a
    // typo where `clockTolerance.target` got changed to `clockLanguage`
    // (also a foldedInto) instead of `clockMode`.
    for (const [field, entry] of Object.entries(__SETUP_SCRIPT_EMITTERS_FOR_TESTS)) {
      if (entry.kind !== 'foldedInto') continue;
      const target = __SETUP_SCRIPT_EMITTERS_FOR_TESTS[entry.target as keyof typeof __SETUP_SCRIPT_EMITTERS_FOR_TESTS];
      expect(target, `field "${field}" folded into missing target "${entry.target}"`).toBeDefined();
      expect(
        target.kind,
        `field "${field}" folded into "${entry.target}" but target is itself ${target.kind}, not 'emit'`,
      ).toBe('emit');
    }
  });
});
