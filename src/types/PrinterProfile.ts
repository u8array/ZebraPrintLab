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
/** Unanchored, negative form for parser-side dropping. No `g` flag so
 *  `.test()` callers don't carry `lastIndex` state across calls. */
export const setupScriptUnsafeCharRegex = new RegExp(`[${SETUP_SCRIPT_UNSAFE_CHARS}]`);
/** Global form for `.replace()`-based stripping. Hoisted so UI input
 *  handlers don't allocate a fresh regex per keystroke. */
const setupScriptUnsafeCharGlobalRegex = new RegExp(`[${SETUP_SCRIPT_UNSAFE_CHARS}]`, 'g');
/** Strip every occurrence of an unsafe char from `raw`. UI inputs feed
 *  user keystrokes through this so a single comma in a paste doesn't
 *  cause the schema regex to reject the whole patch and the store to
 *  roll back silently (a frozen-field UX). */
export const stripUnsafeChars = (raw: string): string =>
  raw.replace(setupScriptUnsafeCharGlobalRegex, '');

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

/** ^MA/^MI alert type. R=head replacement, C=head cleaning per spec. */
export const MAINTENANCE_ALERT_TYPES = ['R', 'C'] as const;
export type MaintenanceAlertType = (typeof MAINTENANCE_ALERT_TYPES)[number];
export const isMaintenanceAlertType = makeEnumGuard(MAINTENANCE_ALERT_TYPES);

/** ^MA print slot: Y=emit warning label, N=skip. */
export const MAINTENANCE_ALERT_PRINT_VALUES = ['Y', 'N'] as const;
export type MaintenanceAlertPrint = (typeof MAINTENANCE_ALERT_PRINT_VALUES)[number];
export const isMaintenanceAlertPrint = makeEnumGuard(MAINTENANCE_ALERT_PRINT_VALUES);

/** ^MA units slot: C=centimeters, I=inches, M=meters. */
export const MAINTENANCE_ALERT_UNITS = ['C', 'I', 'M'] as const;
export type MaintenanceAlertUnit = (typeof MAINTENANCE_ALERT_UNITS)[number];
export const isMaintenanceAlertUnit = makeEnumGuard(MAINTENANCE_ALERT_UNITS);

/** ^MA threshold/frequency caps. Type-dependent per spec:
 *  R (replacement) = 0-150000 m (150 km printhead life),
 *  C (cleaning)    = 0-2000 m. Schema's outer .max uses the larger;
 *  the per-type cap is enforced in superRefine. */
export const MAINTENANCE_DISTANCE_MAX_BY_TYPE = { R: 150000, C: 2000 } as const;
/** ^MI message length cap from Zebra Quick Reference. */
export const MAINTENANCE_MESSAGE_MAX_LEN = 63;

/** ^JH g-slot head-cleaning interval: indexed table 0..16 mapping to
 *  meters in steps of 50 starting at 100M. Wire value is the index. */
export const HEAD_CLEANING_INTERVAL_METERS = [
  100, 150, 200, 250, 300, 350, 400, 450,
  500, 550, 600, 650, 700, 750, 800, 850, 900,
] as const;
export type HeadCleaningIntervalMeters = (typeof HEAD_CLEANING_INTERVAL_METERS)[number];
export const isHeadCleaningIntervalMeters = (n: number): n is HeadCleaningIntervalMeters =>
  (HEAD_CLEANING_INTERVAL_METERS as readonly number[]).includes(n);

/** ^JH positional slot count and indices: f=early-warning master,
 *  g=head-cleaning interval. The other 8 slots are runtime reset
 *  flags we don't model. */
export const JH_SLOT_COUNT = 10;
export const JH_SLOT_F = 5;
export const JH_SLOT_G = 6;

/** Default seed for a freshly enabled ^MA. Matches the spec example
 *  `^MAR,Y,5,1,I`. Spread inline so UI placeholder display and parser
 *  blank-slot fallback stay in sync. */
export const MAINTENANCE_ALERT_DEFAULTS = {
  type: 'R',
  print: 'Y',
  threshold: 5,
  frequency: 1,
  units: 'I',
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
   *  fire; the two are stored independently. The type-specific
   *  threshold/frequency caps are enforced in superRefine. */
  maintenanceAlert: z.object({
    type: z.enum(MAINTENANCE_ALERT_TYPES),
    print: z.enum(['Y', 'N']),
    threshold: z.number().int().min(0).max(MAINTENANCE_DISTANCE_MAX_BY_TYPE.R),
    frequency: z.number().int().min(0).max(MAINTENANCE_DISTANCE_MAX_BY_TYPE.R),
    units: z.enum(MAINTENANCE_ALERT_UNITS),
  }).optional(),
  /** ^MI custom message printed when the matching `^MA{type}` fires. */
  maintenanceMessage: z.object({
    type: z.enum(MAINTENANCE_ALERT_TYPES),
    text: z.string().min(1).max(MAINTENANCE_MESSAGE_MAX_LEN).regex(setupScriptSafeStringRegex),
  }).optional(),
  /** ^MW head-cold warning LCD/alert toggle. */
  headColdWarning: z.enum(['Y', 'N']).optional(),
  /** ^CV barcode validation (session-scoped per spec, not persisted by ^JUS). */
  codeValidation: z.enum(['Y', 'N']).optional(),
  /** ^JH f-slot: early-warning-maintenance master gate that turns
   *  the ^MA alert system on. Without `E` the maintenanceAlert
   *  config sits dormant on the printer. */
  earlyWarningMaintenance: z.enum(['E', 'D']).optional(),
  /** ^JH g-slot head-cleaning interval. Stored as meters for UX; the
   *  wire format is an index into HEAD_CLEANING_INTERVAL_METERS. */
  headCleaningIntervalMeters: z.number().int().refine(
    isHeadCleaningIntervalMeters,
    `must be one of ${HEAD_CLEANING_INTERVAL_METERS.join(', ')}`,
  ).optional(),
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
  if (p.maintenanceAlert) {
    const cap = MAINTENANCE_DISTANCE_MAX_BY_TYPE[p.maintenanceAlert.type];
    if (p.maintenanceAlert.threshold > cap) {
      ctx.addIssue({
        code: 'custom',
        path: ['maintenanceAlert', 'threshold'],
        message: `threshold for type ${p.maintenanceAlert.type} must be ≤ ${cap}`,
      });
    }
    if (p.maintenanceAlert.frequency > cap) {
      ctx.addIssue({
        code: 'custom',
        path: ['maintenanceAlert', 'frequency'],
        message: `frequency for type ${p.maintenanceAlert.type} must be ≤ ${cap}`,
      });
    }
  }
});

export type PrinterProfile = z.infer<typeof printerProfileSchema>;

/** Cascade direction follows whichever side the patch touches:
 *  alert-touched rewrites message.type, message-touched rewrites
 *  alert.type. Both-touched leaves the mismatch to superRefine. */
export function normalizeMaintenanceTypes(
  merged: PrinterProfile,
  patch: Partial<PrinterProfile>,
): PrinterProfile {
  const alert = merged.maintenanceAlert;
  const message = merged.maintenanceMessage;
  if (!alert || !message || alert.type === message.type) return merged;
  const alertTouched = patch.maintenanceAlert?.type !== undefined;
  const messageTouched = patch.maintenanceMessage?.type !== undefined;
  if (alertTouched && !messageTouched) {
    return { ...merged, maintenanceMessage: { ...message, type: alert.type } };
  }
  if (messageTouched && !alertTouched) {
    return { ...merged, maintenanceAlert: { ...alert, type: message.type } };
  }
  return merged;
}

/** Derived from the schema so a new optional field is automatically
 *  picked up by the v4→v5 migration and import loader. */
export const PRINTER_PROFILE_FIELDS = Object.keys(
  printerProfileSchema.shape,
) as readonly (keyof PrinterProfile)[];

export type PrinterProfileField = (typeof PRINTER_PROFILE_FIELDS)[number];

export const EMPTY_PRINTER_PROFILE: PrinterProfile = {};
