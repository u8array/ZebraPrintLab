import { CLOCK_TOLERANCE_RANGE, HEAD_CLEANING_INTERVAL_METERS, HEAD_TEST_INTERVAL_RANGE, JH_SLOT_F, JH_SLOT_G, MAINTENANCE_ALERT_DEFAULTS, MAINTENANCE_DISTANCE_MAX_BY_TYPE, MAINTENANCE_MESSAGE_MAX_LEN, PRINTER_NAME_MAX_LEN, PRINTER_PASSWORD_REGEX, TEAR_OFF_ADJUST_RANGE, isClockFormat, isClockLanguage, isConfigUpdateAction, isMaintenanceAlertPrint, isMaintenanceAlertType, isMaintenanceAlertUnit, isPrinterLocale, isZplMode, setupScriptUnsafeCharRegex } from "../../../types/PrinterProfile";
import { parseIntOrUndef } from "../../inputParse";
import { parseRealtimeClock } from "../../realtimeClock";
import type { ParserState } from "../context";
import { inRange, strParam } from "../helpers";
import type { Handler } from "../types";

/** Setup-Script commands (^JZ, ^JT, ~TA, ^ST, ^KD, ^KL, ^SE, ^SZ,
 *  ^KN, ^SL, ^KP, ^MA, ^MI, ^MW, ^JH, ^JU): all write the shared
 *  `printerProfile` slice. */
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
    // ^SL `a`,`b`; `a` is tri-shape ('S' / 'T' / numeric → TOL).
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
    MA(p) {
      const type = strParam(p[0]);
      if (!isMaintenanceAlertType(type)) return;
      // Each blank slot falls back to its spec default so partial dumps
      // round-trip. Out-of-range or otherwise invalid values still drop
      // the whole command.
      const printRaw = strParam(p[1]);
      const print = printRaw === "" ? MAINTENANCE_ALERT_DEFAULTS.print : printRaw;
      if (!isMaintenanceAlertPrint(print)) return;
      const cap = MAINTENANCE_DISTANCE_MAX_BY_TYPE[type];
      const thresholdRaw = (p[2] ?? "").trim();
      const threshold = thresholdRaw === ""
        ? MAINTENANCE_ALERT_DEFAULTS.threshold
        : inRange(parseIntOrUndef(thresholdRaw), { min: 0, max: cap });
      const frequencyRaw = (p[3] ?? "").trim();
      const frequency = frequencyRaw === ""
        ? MAINTENANCE_ALERT_DEFAULTS.frequency
        : inRange(parseIntOrUndef(frequencyRaw), { min: 0, max: cap });
      if (threshold === undefined || frequency === undefined) return;
      const unitsRaw = strParam(p[4]);
      const units = unitsRaw === "" ? MAINTENANCE_ALERT_DEFAULTS.units : unitsRaw;
      if (!isMaintenanceAlertUnit(units)) return;
      printerProfile.maintenanceAlert = { type, print, threshold, frequency, units };
      // Alert wins per the ^MA/^MI pair policy; drop a stale ^MI.
      if (
        printerProfile.maintenanceMessage &&
        printerProfile.maintenanceMessage.type !== type
      ) {
        delete printerProfile.maintenanceMessage;
      }
    },
    MI(p) {
      const type = strParam(p[0]);
      if (!isMaintenanceAlertType(type)) return;
      // Alert wins: refuse a ^MI that contradicts an existing ^MA.
      if (
        printerProfile.maintenanceAlert &&
        printerProfile.maintenanceAlert.type !== type
      ) return;
      // Rejoin so a message with embedded commas trips the
      // unsafe-char guard below instead of getting silently
      // truncated at the first comma.
      const text = (p.slice(1).join(",")).trim();
      if (!text || text.length > MAINTENANCE_MESSAGE_MAX_LEN) return;
      if (setupScriptUnsafeCharRegex.test(text)) return;
      printerProfile.maintenanceMessage = { type, text };
    },
    MW(_, rest) {
      const v = rest.trim().toUpperCase();
      if (v === "Y" || v === "N") printerProfile.headColdWarning = v;
    },
    CV(_, rest) {
      const v = rest.trim().toUpperCase();
      if (v === "Y" || v === "N") printerProfile.codeValidation = v;
    },
    PA(p) {
      // ^PAa,b,c,d each 0/1; missing slot = 0 (printer default).
      const flag = (raw: string | undefined) => {
        const t = (raw ?? "").trim();
        return t === "1";
      };
      // Only store true; false (=0) is the printer default and stays
      // absent in the profile so emit-on-non-default holds.
      if (flag(p[0])) printerProfile.paSlotA = true;
      if (flag(p[1])) printerProfile.paSlotB = true;
      if (flag(p[2])) printerProfile.paSlotC = true;
      if (flag(p[3])) printerProfile.paSlotD = true;
    },
    // ^JH: only f/g modelled; other slots are runtime reset flags.
    // g is a 0..16 index into HEAD_CLEANING_INTERVAL_METERS per spec.
    JH(p) {
      const f = strParam(p[JH_SLOT_F]);
      if (f === "E" || f === "D") printerProfile.earlyWarningMaintenance = f;
      const idx = parseIntOrUndef((p[JH_SLOT_G] ?? "").trim());
      if (idx !== undefined && idx >= 0 && idx < HEAD_CLEANING_INTERVAL_METERS.length) {
        printerProfile.headCleaningIntervalMeters = HEAD_CLEANING_INTERVAL_METERS[idx];
      }
    },
  };
}
