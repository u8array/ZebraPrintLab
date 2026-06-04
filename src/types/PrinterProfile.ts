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

/** ^MA/^MI alert type. Shared discriminator so one field couples
 *  alert and message at the wire level. */
export const MAINTENANCE_ALERT_TYPES = ['H', 'R'] as const;
export type MaintenanceAlertType = (typeof MAINTENANCE_ALERT_TYPES)[number];
export const isMaintenanceAlertType = makeEnumGuard(MAINTENANCE_ALERT_TYPES);

/** ^MA print slot: Y=emit warning label, N=skip. */
export const MAINTENANCE_ALERT_PRINT_VALUES = ['Y', 'N'] as const;
export type MaintenanceAlertPrint = (typeof MAINTENANCE_ALERT_PRINT_VALUES)[number];
export const isMaintenanceAlertPrint = makeEnumGuard(MAINTENANCE_ALERT_PRINT_VALUES);

/** ^MA units slot: M=meters, I=inches, C=centimeters. */
export const MAINTENANCE_ALERT_UNITS = ['M', 'I', 'C'] as const;
export type MaintenanceAlertUnit = (typeof MAINTENANCE_ALERT_UNITS)[number];
export const isMaintenanceAlertUnit = makeEnumGuard(MAINTENANCE_ALERT_UNITS);

/** ^MA threshold/frequency cap. Spec is implementation-defined;
 *  99999 covers typical ~600m head life. */
export const MAINTENANCE_DISTANCE_MAX = 99999;
/** ^MI message length cap from Zebra Quick Reference. */
export const MAINTENANCE_MESSAGE_MAX_LEN = 63;
/** ^JH g-slot (head cleaning interval) range in meters. Min is 1
 *  so the unset/disabled state is `undefined` rather than ambiguous
 *  `0M`. Max 900 keeps PAX4 compatible.
 *  TODO HW-verify: Zebra docs are ambiguous whether the wire format
 *  is raw `<n>M` or an indexed table (0..16 mapping to 100M..900M).
 *  Current implementation uses `<n>M`; verify on real hardware. */
export const HEAD_CLEANING_INTERVAL_RANGE = { min: 1, max: 900 } as const;

/** Default seed for a freshly enabled ^MA. Matches the spec example
 *  `^MAH,Y,5,1,M`. Spread inline so UI placeholder display and
 *  parser blank-slot fallback stay in sync. */
export const MAINTENANCE_ALERT_DEFAULTS = {
  type: 'H',
  print: 'Y',
  threshold: 5,
  frequency: 1,
  units: 'M',
} as const;

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
  /** ^MA alert. Requires earlyWarningMaintenance==='E' to actually
   *  fire; the two are stored independently. */
  maintenanceAlert: z.object({
    type: z.enum(MAINTENANCE_ALERT_TYPES),
    print: z.enum(['Y', 'N']),
    threshold: z.number().int().min(0).max(MAINTENANCE_DISTANCE_MAX),
    frequency: z.number().int().min(1).max(MAINTENANCE_DISTANCE_MAX),
    units: z.enum(MAINTENANCE_ALERT_UNITS),
  }).optional(),
  /** ^MI custom message printed when the matching `^MA{type}` fires. */
  maintenanceMessage: z.object({
    type: z.enum(MAINTENANCE_ALERT_TYPES),
    text: z.string().min(1).max(MAINTENANCE_MESSAGE_MAX_LEN).regex(setupScriptSafeStringRegex),
  }).optional(),
  /** ^MW head-cold warning LCD/alert toggle. */
  headColdWarning: z.enum(['Y', 'N']).optional(),
  /** ^JH f-slot: early-warning-maintenance master gate that turns
   *  the ^MA alert system on. Without `E` the maintenanceAlert
   *  config sits dormant on the printer. */
  earlyWarningMaintenance: z.enum(['E', 'D']).optional(),
  /** ^JH g-slot head-cleaning interval, stored as a meter count.
   *  Generator emits `<n>M`; spec accepts an `M` suffix only. */
  headCleaningIntervalMeters: intInRange(HEAD_CLEANING_INTERVAL_RANGE).optional(),
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
  if (
    p.maintenanceAlert &&
    p.maintenanceMessage &&
    p.maintenanceAlert.type !== p.maintenanceMessage.type
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['maintenanceMessage', 'type'],
      message: 'maintenanceMessage.type must match maintenanceAlert.type',
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
