import { CLOCK_TOLERANCE_RANGE, HEAD_TEST_INTERVAL_RANGE, PRINTER_NAME_MAX_LEN, PRINTER_PASSWORD_REGEX, TEAR_OFF_ADJUST_RANGE, isClockFormat, isClockLanguage, isConfigUpdateAction, isPrinterLocale, isZplMode, setupScriptUnsafeCharRegex } from "../../../types/PrinterProfile";
import { parseIntOrUndef } from "../../inputParse";
import { parseRealtimeClock } from "../../realtimeClock";
import type { ParserState } from "../context";
import { inRange, strParam } from "../helpers";
import type { Handler } from "../types";

/** Setup-Script commands (^JZ, ^JT, ~TA, ^ST, ^KD, ^KL, ^SE, ^SZ,
 *  ^KN, ^SL, ^KP, ^JU): all write the shared `printerProfile` slice. */
export function createSetupScriptHandlers(s: ParserState): Record<string, Handler> {
  const printerProfile = s.result.printerProfile;
  return {
    JZ(p) {
      const v = strParam(p[0]);
      if (v === "Y" || v === "N") printerProfile.reprintAfterError = v;
    },
    JT(p) {
      const v = inRange(parseIntOrUndef(p[0]), HEAD_TEST_INTERVAL_RANGE);
      if (v !== undefined) printerProfile.headTestInterval = v;
    },
    // ~TA reads p[0] (not raw rest) so trailing stream tokens don't leak in.
    TA(p) {
      const v = inRange(parseIntOrUndef(p[0]), TEAR_OFF_ADJUST_RANGE);
      if (v !== undefined) printerProfile.tearOffAdjust = v;
    },
    ST(p) {
      const iso = parseRealtimeClock(p);
      if (iso !== null) printerProfile.setRealtimeClock = iso;
    },
    KD(_, rest) {
      const v = rest.trim()[0] ?? "";
      if (isClockFormat(v)) printerProfile.clockFormat = v;
    },
    KL(_, rest) {
      const v = rest.trim().toUpperCase();
      if (isPrinterLocale(v)) printerProfile.printerLocale = v;
    },
    // ^SE: unsafe-char guard prevents re-emit injection of ^/~/newline.
    SE(_, rest) {
      const v = rest.trim();
      if (v && !setupScriptUnsafeCharRegex.test(v)) printerProfile.encodingTable = v;
    },
    SZ(_, rest) {
      const v = rest.trim()[0] ?? "";
      if (isZplMode(v)) printerProfile.zplMode = v;
    },
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
    // ^SL `a`,`b` — `a` is tri-shape ('S' / 'T' / numeric → TOL).
    SL(p) {
      const a = strParam(p[0]);
      if (a === "S" || a === "T") {
        printerProfile.clockMode = a;
        // delete (not = undefined) so the import-service fold sees no key.
        delete printerProfile.clockTolerance;
      } else {
        const tol = inRange(parseIntOrUndef(a), CLOCK_TOLERANCE_RANGE);
        if (tol !== undefined) {
          printerProfile.clockMode = "TOL";
          printerProfile.clockTolerance = tol;
        }
      }
      if (printerProfile.clockMode === undefined) return;
      const b = strParam(p[1]);
      if (isClockLanguage(b)) printerProfile.clockLanguage = b;
    },
    KP(p) {
      const raw = (p[0] ?? "").trim();
      if (PRINTER_PASSWORD_REGEX.test(raw)) printerProfile.setPassword = raw;
    },
    JU(_, rest) {
      const v = rest.trim().toUpperCase();
      if (isConfigUpdateAction(v)) printerProfile.configurationUpdate = v;
    },
  };
}
