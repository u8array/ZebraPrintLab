import type { PrinterProfile } from "../../../types/PrinterProfile";
import {
  CLOCK_TOLERANCE_RANGE,
  HEAD_TEST_INTERVAL_RANGE,
  PRINTER_NAME_MAX_LEN,
  TEAR_OFF_ADJUST_RANGE,
  isClockFormat,
  isClockLanguage,
  isPrinterLocale,
  isZplMode,
  setupScriptUnsafeCharRegex,
} from "../../../types/ObjectType";
import { parseIntOrUndef } from "../../inputParse";
import { parseRealtimeClock } from "../../realtimeClock";
import { inRange, strParam } from "../helpers";
import type { Handler } from "../types";

/** Handlers for the 10 Setup-Script commands (^JZ, ^JT, ~TA, ^ST,
 *  ^KD, ^KL, ^SE, ^SZ, ^KN, ^SL). All write to the shared
 *  `printerProfile` slice — no other parser state is touched, so
 *  the family takes only that one reference. First handler-family
 *  extracted under epic #4; same pattern will apply to barcodes /
 *  graphics / fields / printer-state once `ParserContext` lands. */
export function createSetupScriptHandlers(
  printerProfile: Partial<PrinterProfile>,
): Record<string, Handler> {
  return {
    JZ(p) {
      const v = strParam(p[0]);
      if (v === "Y" || v === "N") printerProfile.reprintAfterError = v;
    },
    JT(p) {
      const v = inRange(parseIntOrUndef(p[0]), HEAD_TEST_INTERVAL_RANGE);
      if (v !== undefined) printerProfile.headTestInterval = v;
    },
    // ~TA reads p[0] (not the raw rest string) so trailing tokens
    // from a streamed ZPL chunk (e.g. `~TA10^XA…`) don't leak into
    // the parsed value.
    TA(p) {
      const v = inRange(parseIntOrUndef(p[0]), TEAR_OFF_ADJUST_RANGE);
      if (v !== undefined) printerProfile.tearOffAdjust = v;
    },
    // ^ST MM,DD,YYYY,HH,MM,SS — set real-time clock. Delegates shape +
    // range validation to the shared `realtimeClock` helper so parser
    // and generator cannot drift on round-trip.
    ST(p) {
      const iso = parseRealtimeClock(p);
      if (iso !== null) printerProfile.setRealtimeClock = iso;
    },
    // ^KD: reads only the first char of `rest`; matches the parser's
    // lenient first-char approach (PO / PM / MT do the same).
    KD(_, rest) {
      const v = rest.trim()[0] ?? "";
      if (isClockFormat(v)) printerProfile.clockFormat = v;
    },
    KL(_, rest) {
      const v = rest.trim().toUpperCase();
      if (isPrinterLocale(v)) printerProfile.printerLocale = v;
    },
    // ^SE: free-string path; dangerous-char check mirrors the schema
    // regex so an imported ZPL cannot smuggle ^/~/newline into the
    // path and re-emit as an injected command.
    SE(_, rest) {
      const v = rest.trim();
      if (v && !setupScriptUnsafeCharRegex.test(v)) printerProfile.encodingTable = v;
    },
    SZ(_, rest) {
      const v = rest.trim()[0] ?? "";
      if (isZplMode(v)) printerProfile.zplMode = v;
    },
    // ^KN <name>,<description>. Both parts free strings; the injection
    // guard mirrors the schema. Name length cap stays per spec.
    KN(p) {
      const name = (p[0] ?? "").trim();
      if (!name || name.length > PRINTER_NAME_MAX_LEN) return;
      if (setupScriptUnsafeCharRegex.test(name)) return;
      printerProfile.printerName = name;
      const desc = (p[1] ?? "").trim();
      if (desc && !setupScriptUnsafeCharRegex.test(desc)) {
        printerProfile.printerDescription = desc;
      }
    },
    // ^SL `a`,`b` — Set Mode and Language for ^FC clock fields.
    // `a` is tri-shape: 'S' / 'T' / numeric 1..999 (TOL with
    // tolerance). Parser fans the wire value out into clockMode +
    // clockTolerance per schema's cross-field rule.
    SL(p) {
      const a = strParam(p[0]);
      if (a === "S" || a === "T") {
        printerProfile.clockMode = a;
        // Clear stale tolerance from a previous ^SL parse — schema
        // forbids `tolerance && mode !== 'TOL'`, and the parser
        // writes raw values without re-running the schema. `delete`
        // rather than `= undefined` so the returned ParsedZPL doesn't
        // carry a present-with-undefined key that would leak across
        // the import-service fold as a misleading "clear" signal.
        delete printerProfile.clockTolerance;
      } else {
        const tol = inRange(parseIntOrUndef(a), CLOCK_TOLERANCE_RANGE);
        if (tol !== undefined) {
          printerProfile.clockMode = "TOL";
          printerProfile.clockTolerance = tol;
        }
      }
      // Language only when the mode parse landed — orphan language
      // would be write-only state.
      if (printerProfile.clockMode === undefined) return;
      const b = strParam(p[1]);
      if (isClockLanguage(b)) printerProfile.clockLanguage = b;
    },
  };
}
