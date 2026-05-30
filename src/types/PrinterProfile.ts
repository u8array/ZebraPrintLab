import { z } from 'zod';
import {
  CLOCK_FORMAT_VALUES,
  CLOCK_LANGUAGE_VALUES,
  CLOCK_MODE_VALUES,
  CLOCK_TOLERANCE_RANGE,
  HEAD_TEST_INTERVAL_RANGE,
  PRINTER_LOCALE_VALUES,
  PRINTER_NAME_MAX_LEN,
  TEAR_OFF_ADJUST_RANGE,
  ZPL_MODE_VALUES,
  intInRange,
  realtimeClockIsoRegex,
  setupScriptSafeStringRegex,
} from './ObjectType';

/** Printer-installation profile: the EEPROM-persistent printer-state
 *  fields that previously lived on `labelConfig`. Separated out so:
 *   1. design files no longer leak Setup-Script values when shared
 *      (printer name, locale, etc. belong to the install, not the label),
 *   2. the data model matches the UX split between per-label and
 *      printer-wide configuration that Tab 1/2 vs Tab 3/4/5 of the
 *      Printer Settings modal already implies,
 *   3. a future multi-profile feature (one PrinterProfile per
 *      physical printer) has a clean schema to fan out over —
 *      currently the store keeps a single active profile. */
export const printerProfileSchema = z.object({
  /** ^JZ: reprint the previous label after a print error. */
  reprintAfterError: z.enum(['Y', 'N']).optional(),
  /** ^JT: head-test interval (labels between printhead element tests). */
  headTestInterval: intInRange(HEAD_TEST_INTERVAL_RANGE).optional(),
  /** ~TA: tear-off position adjustment in dot rows. */
  tearOffAdjust: intInRange(TEAR_OFF_ADJUST_RANGE).optional(),
  /** ^ST: static set-clock value (HTML5 `datetime-local` string). */
  setRealtimeClock: z.string().regex(realtimeClockIsoRegex).optional(),
  /** ^ST live-mode toggle: when true, generator captures the wall-clock
   *  time at export-time and ignores `setRealtimeClock`. */
  useCurrentTimeForClock: z.boolean().optional(),
  /** ^KD: clock-print format selector. */
  clockFormat: z.enum(CLOCK_FORMAT_VALUES).optional(),
  /** ^SL `a`: clock mode (S / T / TOL). */
  clockMode: z.enum(CLOCK_MODE_VALUES).optional(),
  /** ^SL `a` numeric form: tolerance in seconds when `clockMode === 'TOL'`. */
  clockTolerance: intInRange(CLOCK_TOLERANCE_RANGE).optional(),
  /** ^SL `b`: clock-language code. */
  clockLanguage: z.enum(CLOCK_LANGUAGE_VALUES).optional(),
  /** ^KL: printer-side display locale. */
  printerLocale: z.enum(PRINTER_LOCALE_VALUES).optional(),
  /** ^SE: encoding-table file path on the printer. */
  encodingTable: z.string().min(1).regex(setupScriptSafeStringRegex).optional(),
  /** ^SZ: ZPL mode selector. */
  zplMode: z.enum(ZPL_MODE_VALUES).optional(),
  /** ^KN p1: friendly printer name (max 16 chars per spec). */
  printerName: z.string().min(1).max(PRINTER_NAME_MAX_LEN).regex(setupScriptSafeStringRegex).optional(),
  /** ^KN p2: human-readable printer description. */
  printerDescription: z.string().min(1).regex(setupScriptSafeStringRegex).optional(),
}).superRefine((p, ctx) => {
  if (p.clockTolerance !== undefined && p.clockMode !== 'TOL') {
    ctx.addIssue({
      code: 'custom',
      path: ['clockTolerance'],
      message: 'clockTolerance is only valid when clockMode === "TOL"',
    });
  }
  if (p.clockMode === 'TOL' && p.clockTolerance === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['clockTolerance'],
      message: 'clockMode "TOL" requires clockTolerance to be set',
    });
  }
});

export type PrinterProfile = z.infer<typeof printerProfileSchema>;

/** Fields owned by PrinterProfile. Derived from the schema so a new
 *  optional field added to `printerProfileSchema` is automatically
 *  picked up by the v4→v5 migration and the import loader — without
 *  the derivation a forgotten array entry would silently leak fresh
 *  fields into per-label state on rehydrate. */
export const PRINTER_PROFILE_FIELDS = Object.keys(
  printerProfileSchema.shape,
) as readonly (keyof PrinterProfile)[];

export type PrinterProfileField = (typeof PRINTER_PROFILE_FIELDS)[number];

export const EMPTY_PRINTER_PROFILE: PrinterProfile = {};
