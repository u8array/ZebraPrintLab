import { z } from 'zod';
import { intInRange, makeEnumGuard } from './typeHelpers';

/** ^ST real-time clock value (HTML5 datetime-local shape). */
export const realtimeClockIsoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** ^KN printer-name length cap per Zebra spec (16 characters). */
export const PRINTER_NAME_MAX_LEN = 16;

/** Character class of "dangerous" chars in Setup-Script free-string
 *  positionals. Includes ZPL command-introducer chars (`^`, `~`),
 *  the positional delimiter `,`, newlines, and control codes. */
// String-based char class (passed to `new RegExp`) so the
// no-control-regex rule does not fire here.
const SETUP_SCRIPT_UNSAFE_CHARS = '\\^~,\\r\\n\\x00-\\x1f';
/** Anchored, positive form for `z.string().regex(...)` schema checks. */
export const setupScriptSafeStringRegex = new RegExp(`^[^${SETUP_SCRIPT_UNSAFE_CHARS}]+$`);
/** Unanchored, negative form for parser-side dropping. */
export const setupScriptUnsafeCharRegex = new RegExp(`[${SETUP_SCRIPT_UNSAFE_CHARS}]`);

/** ^KL printer locale — two-letter ISO 639-1 shorthands per Zebra spec. */
export const PRINTER_LOCALE_VALUES = [
  'EN', 'ES', 'FR', 'DE', 'IT', 'NO', 'PT', 'SV', 'DK', 'SP2', 'NL', 'FI', 'JP', 'KR', 'SC', 'TC', 'RU', 'PL', 'CZ', 'RO', 'HU',
] as const;
export type PrinterLocale = (typeof PRINTER_LOCALE_VALUES)[number];
export const isPrinterLocale = makeEnumGuard(PRINTER_LOCALE_VALUES);

/** ^SZ ZPL mode selector. `2` = ZPL II, `1` = legacy. */
export const ZPL_MODE_VALUES = ['1', '2'] as const;
export type ZplMode = (typeof ZPL_MODE_VALUES)[number];
export const isZplMode = makeEnumGuard(ZPL_MODE_VALUES);

/** ^SL clock mode selector. Three shapes (S / T / numeric 1..999); generator
 *  and parser fold the numeric variant back into the single positional slot.
 *    S    = Start-Time mode — stamp captured when ^XA arrives
 *    T    = Time-Now mode — stamp captured at queue dequeue
 *    TOL  = Time-Now with tolerance window in seconds */
export const CLOCK_MODE_VALUES = ['S', 'T', 'TOL'] as const;
export type ClockMode = (typeof CLOCK_MODE_VALUES)[number];
export const isClockMode = makeEnumGuard(CLOCK_MODE_VALUES);

/** ^SL tolerance (seconds) when `clockMode === 'TOL'`. */
export const CLOCK_TOLERANCE_RANGE = { min: 1, max: 999 } as const;
/** UX default seeded when the user picks TOL mode. Matches `^SL60,1` spec example. */
export const CLOCK_TOLERANCE_DEFAULT = 60;

/** ^SL clock-language codes. Numeric 1..13 per spec; stored as digit chars. */
export const CLOCK_LANGUAGE_VALUES = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13',
] as const;
export type ClockLanguage = (typeof CLOCK_LANGUAGE_VALUES)[number];
export const isClockLanguage = makeEnumGuard(CLOCK_LANGUAGE_VALUES);

/** ^KD clock-print format. 0=disabled, 1=MM/DD/YY 24h, 2=MM/DD/YY 12h AM/PM, 3=DD/MM/YY 24h. */
export const CLOCK_FORMAT_VALUES = ['0', '1', '2', '3'] as const;
export type ClockFormat = (typeof CLOCK_FORMAT_VALUES)[number];
export const isClockFormat = makeEnumGuard(CLOCK_FORMAT_VALUES);

export const HEAD_TEST_INTERVAL_RANGE = { min: 0, max: 10000 } as const;
export const TEAR_OFF_ADJUST_RANGE = { min: -120, max: 120 } as const;

/** ^KP front-panel password. 4-digit numeric, '0000' disables LCD-
 *  setup protection. Default at factory is '1234'. */
export const PRINTER_PASSWORD_REGEX = /^\d{4}$/;

/** ^JU configuration update actions. S=save, R=recall last saved,
 *  N=reload factory network settings (destructive), F=full factory
 *  reset (destructive). All four are exposed in the UI; the
 *  destructive pair carry a "(destructive)" suffix in their locale
 *  labels so a misclick is at least visible. */
export const CONFIG_UPDATE_VALUES = ['S', 'R', 'N', 'F'] as const;
export type ConfigUpdateAction = (typeof CONFIG_UPDATE_VALUES)[number];
export const isConfigUpdateAction = makeEnumGuard(CONFIG_UPDATE_VALUES);

/** Printer-installation profile: EEPROM-persistent printer-state
 *  fields separated from `labelConfig` so design files don't leak
 *  per-install values when shared. */
export const printerProfileSchema = z.object({
  reprintAfterError: z.enum(['Y', 'N']).optional(),
  headTestInterval: intInRange(HEAD_TEST_INTERVAL_RANGE).optional(),
  tearOffAdjust: intInRange(TEAR_OFF_ADJUST_RANGE).optional(),
  setRealtimeClock: z.string().regex(realtimeClockIsoRegex).optional(),
  /** ^ST live-mode toggle: when true, generator captures wall-clock
   *  at export-time and ignores `setRealtimeClock`. */
  useCurrentTimeForClock: z.boolean().optional(),
  clockFormat: z.enum(CLOCK_FORMAT_VALUES).optional(),
  clockMode: z.enum(CLOCK_MODE_VALUES).optional(),
  /** ^SL numeric tolerance; cross-field-bound to clockMode === 'TOL'. */
  clockTolerance: intInRange(CLOCK_TOLERANCE_RANGE).optional(),
  clockLanguage: z.enum(CLOCK_LANGUAGE_VALUES).optional(),
  printerLocale: z.enum(PRINTER_LOCALE_VALUES).optional(),
  encodingTable: z.string().min(1).regex(setupScriptSafeStringRegex).optional(),
  zplMode: z.enum(ZPL_MODE_VALUES).optional(),
  printerName: z.string().min(1).max(PRINTER_NAME_MAX_LEN).regex(setupScriptSafeStringRegex).optional(),
  printerDescription: z.string().min(1).regex(setupScriptSafeStringRegex).optional(),
  setPassword: z.string().regex(PRINTER_PASSWORD_REGEX).optional(),
  /** ^JU action. Generator emits the value as `^JU{action}` last in
   *  the setup-script block so an `S` commit happens after every
   *  other persistent write in the same script. */
  configurationUpdate: z.enum(CONFIG_UPDATE_VALUES).optional(),
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

/** Derived from the schema so a new optional field is automatically
 *  picked up by the v4→v5 migration and import loader. */
export const PRINTER_PROFILE_FIELDS = Object.keys(
  printerProfileSchema.shape,
) as readonly (keyof PrinterProfile)[];

export type PrinterProfileField = (typeof PRINTER_PROFILE_FIELDS)[number];

export const EMPTY_PRINTER_PROFILE: PrinterProfile = {};
