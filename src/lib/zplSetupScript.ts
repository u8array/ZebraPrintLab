import type { PrinterProfile } from '../types/PrinterProfile';
import { formatRealtimeClockForZpl, toLocalIsoString } from './realtimeClock';

/**
 * Generates the one-shot Setup-Script output for a printer profile.
 *
 * Separate from `generateZPL` because the commands this emits are
 * EEPROM-persistent printer state (~TA, ^JZ, ^JT, and the clock /
 * encoding / identity commands). Re-emitting them on every label
 * would wear the printer's flash; the Setup-Script is meant to be
 * sent once when the printer is provisioned, not on every print job.
 *
 * Per-label commands that *also* touch EEPROM (^MD, ^MT, ^MM, ^ML)
 * stay in `generateZPL` because they conceptually belong to "this
 * label's media setup". Instant-only commands (~SD) stay per-label
 * too — they don't write flash. The split is "should this value
 * change per print job" rather than "is the write persistent".
 *
 * Shape follows the Zebra-idiomatic split:
 *   - tilde-prefix commands (~TA) stand alone above the block
 *   - caret-prefix commands (^JZ, ^JT, …) live inside a wrapper
 *     `^XA…^XZ` block, since caret commands are only valid within
 *     a label definition
 *
 * Returns an empty string when no Setup-Script-relevant field is
 * set, so the UI can hide the output pane without a separate
 * "is anything to emit" predicate.
 *
 * Note on default-value emits (`~TA0`, `^JT0`, `^JZY`, `^KD0`):
 * these write the printer's documented default back to EEPROM and
 * could be skipped as "no-ops" to spare flash. The generator keeps
 * them anyway because (a) "user explicitly chose 0" is a legitimate
 * reset signal, and (b) the printer firmware may have been left in
 * a non-default state by an earlier script — emitting the default
 * is the only way to be sure the field actually lands there.
 * Skip-when-default would be silent wrong-state.
 */

/** Registry entry kinds.
 *
 *  `emit` entries own a real ZPL command. They take the full profile
 *  so the emitter handles its own undefined-check and any value-shape
 *  transformation (e.g. the ^ST datetime-to-positional split).
 *  Returning `null` skips the field, returning a string pushes it
 *  onto the relevant channel queue.
 *
 *  `foldedInto` entries are pure metadata — fields that don't emit a
 *  standalone command because they ride along on another field's
 *  emit (e.g. `printerDescription` is a positional param of `^KN`,
 *  `clockTolerance` is folded into `^SL` based on `clockMode`). The
 *  `target` is documentary and also lets the generator iteration
 *  cheaply skip these fields without calling a no-op closure. */
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

/** Single registry of all Setup-Script commands. Keys must be
 *  `keyof PrinterProfile` (enforced via `satisfies Partial<Record<…>>`)
 *  so a typo or a field renamed in the schema surfaces here. Adding
 *  a new Setup-Script command means one entry in this map — the
 *  if-chain in `generateSetupScript`, the no-leak test, and the
 *  exported `SETUP_SCRIPT_FIELDS` list all derive from it. */
const SETUP_SCRIPT_EMITTERS = {
  tearOffAdjust: {
    kind: 'emit',
    channel: 'tilde',
    // ~TA requires the magnitude to be exactly 3 digits per the Zebra
    // spec: "if the number of characters is less than 3, the command
    // is ignored." So `~TA5` is silently dropped by firmware; the
    // correct form is `~TA005`. The sign (if any) sits OUTSIDE the
    // 3-digit width: `~TA-050`, `~TA005`.
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
    // Two paths share the ^ST slot: when `useCurrentTimeForClock`
    // is on, the emit captures *now* at call-time (live mode —
    // every export gets a fresh stamp, the Setup-Script is no
    // longer reproducible but it actually "sets the clock"). When
    // off, the stored ISO string is emitted verbatim (static mode
    // — reproducible, but the user has to remember to set the
    // value before sending). The live branch wins when both are
    // set, so toggling the checkbox in the UI is unambiguous.
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
  useCurrentTimeForClock: {
    kind: 'foldedInto',
    target: 'setRealtimeClock',
  },
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
    // ^KN takes two positional params; description rides along
    // only when set. The `printerDescription` registry entry below
    // intentionally returns null on its own (it has no standalone
    // ZPL command) — the description is folded in here so the
    // ^KN emit stays a single line. Both values are `.trim()`ed
    // on emit because the parser trims on import, and asymmetric
    // whitespace would silently break the round-trip invariant.
    emit: (p) => {
      if (p.printerName === undefined) return null;
      const name = p.printerName.trim();
      // Schema's min(1) accepts whitespace-only strings; trimming
      // to empty here drops the emit so the parser's "no name = no
      // ^KN" round-trip rule holds. Without this guard, `^KN` (or
      // `^KN,desc`) would emit and the parser would silently drop
      // both fields on re-import.
      if (!name) return null;
      const desc = p.printerDescription?.trim();
      return desc ? `^KN${name},${desc}` : `^KN${name}`;
    },
  },
  printerDescription: {
    kind: 'foldedInto',
    target: 'printerName',
  },
  clockMode: {
    kind: 'emit',
    channel: 'block',
    // ^SL has three value shapes in one positional slot: 'S', 'T',
    // or numeric 1..999 (TOL with tolerance). Schema's cross-field
    // refine guarantees that `mode === 'TOL'` always has a defined
    // `clockTolerance`, so no fallback is needed here — a missing
    // tolerance under TOL is unreachable through `parse`. Language
    // rides along when set; if omitted, the printer keeps its
    // current second-positional value.
    emit: (p) => {
      if (p.clockMode === undefined) return null;
      const a = p.clockMode === 'TOL'
        ? String(p.clockTolerance)
        : p.clockMode;
      const b = p.clockLanguage;
      return b !== undefined ? `^SL${a},${b}` : `^SL${a}`;
    },
  },
  clockTolerance: {
    kind: 'foldedInto',
    target: 'clockMode',
  },
  clockLanguage: {
    // Language rides on ^SL's second positional. If language is set
    // but mode is not, the printer would need a bare `^SL,<lang>`
    // which the spec leaves implementation-defined — we drop instead
    // of guessing. The fold target is `clockMode` because the emit
    // path lives there even though `clockLanguage` is independently
    // settable from the UI.
    kind: 'foldedInto',
    target: 'clockMode',
  },
} as const satisfies Partial<Record<keyof PrinterProfile, SetupScriptEntry>>;

/** Public list of the PrinterProfile fields that flow through the
 *  Setup-Script generator. Derived from the registry so the two
 *  cannot drift. Consumers (test no-leak assertion, modal rail
 *  grouping) read this instead of hard-coding the list. */
export const SETUP_SCRIPT_FIELDS = Object.keys(
  SETUP_SCRIPT_EMITTERS,
) as readonly SetupScriptField[];

export type SetupScriptField = keyof typeof SETUP_SCRIPT_EMITTERS;

/** Re-export the registry for tests that need to assert structural
 *  invariants (e.g. every foldedInto.target points at a kind:'emit'
 *  entry, never another foldedInto — that would create a fold chain
 *  with no actual emit producer). Kept module-internal-ish: not
 *  intended for runtime consumers, just the test boundary. */
export const __SETUP_SCRIPT_EMITTERS_FOR_TESTS = SETUP_SCRIPT_EMITTERS;

export function generateSetupScript(profile: PrinterProfile): string {
  const tildeLines: string[] = [];
  const blockLines: string[] = [];

  for (const field of SETUP_SCRIPT_FIELDS) {
    const e = SETUP_SCRIPT_EMITTERS[field];
    // foldedInto entries don't emit on their own; their value rides
    // along on the `target` field's emit. Skip without calling.
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
