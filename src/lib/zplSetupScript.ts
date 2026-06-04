import type { PrinterProfile } from '../types/PrinterProfile';
import { formatRealtimeClockForZpl, toLocalIsoString } from './realtimeClock';

/** Generates the one-shot Setup-Script ZPL for a printer profile —
 *  EEPROM-persistent state (~TA, ^JZ, ^JT, clock / encoding / identity)
 *  meant to be sent once at provisioning, not on every print job.
 *  Returns '' when no field is set so callers can hide the pane without
 *  a separate predicate. Default-value emits (`~TA000`, `^JZY`, …) are
 *  kept rather than skipped: emitting the documented default is the
 *  only way to be sure the field actually lands there after an
 *  earlier script left the printer in a non-default state. */

type SetupScriptEntry =
  | {
      kind: 'emit';
      channel: 'tilde' | 'block';
      emit: (profile: PrinterProfile) => string | null;
    }
  | {
      kind: 'foldedInto';
      target: keyof PrinterProfile;
    };

/** Named indices for the two ^JH slots we model (a..j = 0..9). */
const JH_SLOT_F = 5;
const JH_SLOT_G = 6;

const SETUP_SCRIPT_EMITTERS = {
  tearOffAdjust: {
    kind: 'emit',
    channel: 'tilde',
    // Spec: "if the number of characters is less than 3, the command
    // is ignored." `~TA5` is dropped by firmware; correct form is
    // `~TA005`. Sign sits outside the 3-digit width.
    emit: (p) => {
      if (p.tearOffAdjust === undefined) return null;
      const v = p.tearOffAdjust;
      const sign = v < 0 ? '-' : '';
      const mag = String(Math.abs(v)).padStart(3, '0');
      return `~TA${sign}${mag}`;
    },
  },
  reprintAfterError: {
    kind: 'emit',
    channel: 'block',
    emit: (p) => p.reprintAfterError !== undefined ? `^JZ${p.reprintAfterError}` : null,
  },
  headTestInterval: {
    kind: 'emit',
    channel: 'block',
    emit: (p) => p.headTestInterval !== undefined ? `^JT${p.headTestInterval}` : null,
  },
  setRealtimeClock: {
    kind: 'emit',
    channel: 'block',
    // Live mode (useCurrentTimeForClock) captures now() at emit-time
    // and wins over the stored static value. Toggling the checkbox in
    // the UI is therefore unambiguous regardless of stored ISO state.
    emit: (p) => {
      if (p.useCurrentTimeForClock) {
        const params = formatRealtimeClockForZpl(toLocalIsoString());
        return params !== null ? `^ST${params}` : null;
      }
      if (p.setRealtimeClock === undefined) return null;
      const params = formatRealtimeClockForZpl(p.setRealtimeClock);
      return params !== null ? `^ST${params}` : null;
    },
  },
  useCurrentTimeForClock: { kind: 'foldedInto', target: 'setRealtimeClock' },
  clockFormat: {
    kind: 'emit',
    channel: 'block',
    emit: (p) => p.clockFormat !== undefined ? `^KD${p.clockFormat}` : null,
  },
  printerLocale: {
    kind: 'emit',
    channel: 'block',
    emit: (p) => p.printerLocale !== undefined ? `^KL${p.printerLocale}` : null,
  },
  encodingTable: {
    kind: 'emit',
    channel: 'block',
    emit: (p) => p.encodingTable !== undefined ? `^SE${p.encodingTable}` : null,
  },
  zplMode: {
    kind: 'emit',
    channel: 'block',
    emit: (p) => p.zplMode !== undefined ? `^SZ${p.zplMode}` : null,
  },
  printerName: {
    kind: 'emit',
    channel: 'block',
    emit: (p) => {
      if (p.printerName === undefined) return null;
      // Trim both halves: parser trims on import; asymmetric whitespace
      // would break the round-trip invariant. Whitespace-only name
      // drops the emit so the parser's "no name = no ^KN" rule holds.
      const name = p.printerName.trim();
      if (!name) return null;
      const desc = p.printerDescription?.trim();
      return desc ? `^KN${name},${desc}` : `^KN${name}`;
    },
  },
  printerDescription: { kind: 'foldedInto', target: 'printerName' },
  setPassword: {
    kind: 'emit',
    channel: 'block',
    emit: (p) => p.setPassword !== undefined ? `^KP${p.setPassword}` : null,
  },
  clockMode: {
    kind: 'emit',
    channel: 'block',
    // ^SL `a` slot is tri-shape: 'S', 'T', or numeric tolerance (TOL
    // mode). Schema's cross-field refine guarantees TOL always has a
    // defined clockTolerance, so no fallback needed.
    emit: (p) => {
      if (p.clockMode === undefined) return null;
      const a = p.clockMode === 'TOL' ? String(p.clockTolerance) : p.clockMode;
      const b = p.clockLanguage;
      return b !== undefined ? `^SL${a},${b}` : `^SL${a}`;
    },
  },
  clockTolerance: { kind: 'foldedInto', target: 'clockMode' },
  // Drop bare `^SL,<lang>` (mode unset): spec leaves the shape
  // implementation-defined.
  clockLanguage: { kind: 'foldedInto', target: 'clockMode' },
  // ^JH precedes ^MA so the master gate is on when the alert lands;
  // otherwise the printer discards the alert until ^JUS + reboot.
  // earlyWarningMaintenance owns the composite emit;
  // headCleaningIntervalMeters folds in (cf. ^KN).
  earlyWarningMaintenance: {
    kind: 'emit',
    channel: 'block',
    emit: (p) => {
      if (p.earlyWarningMaintenance === undefined && p.headCleaningIntervalMeters === undefined) {
        return null;
      }
      const slots = ['', '', '', '', '', '', '', '', '', ''];
      slots[JH_SLOT_F] = p.earlyWarningMaintenance ?? '';
      if (p.headCleaningIntervalMeters !== undefined) {
        slots[JH_SLOT_G] = `${p.headCleaningIntervalMeters}M`;
      }
      return `^JH${slots.join(',')}`;
    },
  },
  headCleaningIntervalMeters: { kind: 'foldedInto', target: 'earlyWarningMaintenance' },
  maintenanceAlert: {
    kind: 'emit',
    channel: 'block',
    emit: (p) => {
      const m = p.maintenanceAlert;
      if (!m) return null;
      return `^MA${m.type},${m.print},${m.threshold},${m.frequency},${m.units}`;
    },
  },
  maintenanceMessage: {
    kind: 'emit',
    channel: 'block',
    emit: (p) => p.maintenanceMessage
      ? `^MI${p.maintenanceMessage.type},${p.maintenanceMessage.text}`
      : null,
  },
  headColdWarning: {
    kind: 'emit',
    channel: 'block',
    emit: (p) => p.headColdWarning !== undefined ? `^MW${p.headColdWarning}` : null,
  },
  // configurationUpdate is the registry's last entry on purpose: a
  // commit (`^JUS`) needs to follow every other persistent write so
  // the EEPROM lands the rest of the block before being asked to
  // save itself. The Zebra app note for ^JU also warns that more
  // than one ^JU per file is unsupported, so we never split this.
  // The "is-last" invariant is anchored by a tripwire in
  // zplSetupScript.test.ts so adding a later entry can't silently
  // break the commit semantics.
  configurationUpdate: {
    kind: 'emit',
    channel: 'block',
    emit: (p) => p.configurationUpdate !== undefined ? `^JU${p.configurationUpdate}` : null,
  },
} as const satisfies Partial<Record<keyof PrinterProfile, SetupScriptEntry>>;

/** Public list of the PrinterProfile fields that flow through the
 *  Setup-Script generator. Derived from the registry so the two
 *  cannot drift. */
export const SETUP_SCRIPT_FIELDS = Object.keys(
  SETUP_SCRIPT_EMITTERS,
) as readonly SetupScriptField[];

export type SetupScriptField = keyof typeof SETUP_SCRIPT_EMITTERS;

/** Test-only re-export so an invariant check can walk foldedInto
 *  targets without re-implementing the registry shape. */
export const __SETUP_SCRIPT_EMITTERS_FOR_TESTS = SETUP_SCRIPT_EMITTERS;

export function generateSetupScript(profile: PrinterProfile): string {
  const tildeLines: string[] = [];
  const blockLines: string[] = [];

  for (const field of SETUP_SCRIPT_FIELDS) {
    const e = SETUP_SCRIPT_EMITTERS[field];
    if (e.kind !== 'emit') continue;
    const line = e.emit(profile);
    if (line === null) continue;
    (e.channel === 'tilde' ? tildeLines : blockLines).push(line);
  }

  if (tildeLines.length === 0 && blockLines.length === 0) return '';

  const out = [...tildeLines];
  if (blockLines.length > 0) {
    out.push('^XA', ...blockLines, '^XZ');
  }
  return out.join('\n');
}
