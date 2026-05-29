import type { LabelConfig } from '../types/ObjectType';
import { formatRealtimeClockForZpl } from './realtimeClock';

/**
 * Generates the one-shot Setup-Script output for a label config.
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

/** Per-field emitter: takes the full label so the emitter owns its
 *  own undefined-check and any value-shape transformation (e.g.
 *  the ^ST datetime-to-positional split). Returning `null` skips
 *  the field, returning a string pushes it onto the relevant
 *  channel queue. Wraps the label rather than the field value so
 *  TS keeps per-field narrowing inside each emitter — passing only
 *  the value would lose the discriminant. */
interface SetupScriptEmitter {
  channel: 'tilde' | 'block';
  emit: (label: LabelConfig) => string | null;
}

/** Single registry of all Setup-Script commands. Keys must be
 *  `keyof LabelConfig` (enforced via `satisfies Partial<Record<…>>`)
 *  so a typo or a field renamed in the schema surfaces here. Adding
 *  a new Setup-Script command means one entry in this map — the
 *  if-chain in `generateSetupScript`, the no-leak test, and the
 *  exported `SETUP_SCRIPT_FIELDS` list all derive from it. */
const SETUP_SCRIPT_EMITTERS = {
  tearOffAdjust: {
    channel: 'tilde',
    // No zero-pad: ~TA accepts a signed integer (-120..+120) directly.
    // `tearOffAdjust === 0` emits `~TA0` intentionally per the
    // default-value-emit note in the file docstring.
    emit: (l) => l.tearOffAdjust !== undefined ? `~TA${l.tearOffAdjust}` : null,
  },
  reprintAfterError: {
    channel: 'block',
    emit: (l) => l.reprintAfterError !== undefined ? `^JZ${l.reprintAfterError}` : null,
  },
  headTestInterval: {
    channel: 'block',
    emit: (l) => l.headTestInterval !== undefined ? `^JT${l.headTestInterval}` : null,
  },
  setRealtimeClock: {
    channel: 'block',
    emit: (l) => {
      if (l.setRealtimeClock === undefined) return null;
      const params = formatRealtimeClockForZpl(l.setRealtimeClock);
      return params !== null ? `^ST${params}` : null;
    },
  },
  clockFormat: {
    channel: 'block',
    emit: (l) => l.clockFormat !== undefined ? `^KD${l.clockFormat}` : null,
  },
  printerLocale: {
    channel: 'block',
    emit: (l) => l.printerLocale !== undefined ? `^KL${l.printerLocale}` : null,
  },
  encodingTable: {
    channel: 'block',
    emit: (l) => l.encodingTable !== undefined ? `^SE${l.encodingTable}` : null,
  },
  zplMode: {
    channel: 'block',
    emit: (l) => l.zplMode !== undefined ? `^SZ${l.zplMode}` : null,
  },
  printerName: {
    channel: 'block',
    // ^KN takes two positional params; description rides along
    // only when set. The `printerDescription` registry entry below
    // intentionally returns null on its own (it has no standalone
    // ZPL command) — the description is folded in here so the
    // ^KN emit stays a single line. Both values are `.trim()`ed
    // on emit because the parser trims on import, and asymmetric
    // whitespace would silently break the round-trip invariant.
    emit: (l) => {
      if (l.printerName === undefined) return null;
      const name = l.printerName.trim();
      // Schema's min(1) accepts whitespace-only strings; trimming
      // to empty here drops the emit so the parser's "no name = no
      // ^KN" round-trip rule holds. Without this guard, `^KN` (or
      // `^KN,desc`) would emit and the parser would silently drop
      // both fields on re-import.
      if (!name) return null;
      const desc = l.printerDescription?.trim();
      return desc ? `^KN${name},${desc}` : `^KN${name}`;
    },
  },
  printerDescription: {
    // Folded into the ^KN emit above; this entry exists only so
    // the SETUP_SCRIPT_FIELDS list (derived via Object.keys) sees
    // the field and the no-leak test knows it's per-spec a
    // Setup-Script field.
    channel: 'block',
    emit: () => null,
  },
} as const satisfies Partial<Record<keyof LabelConfig, SetupScriptEmitter>>;

/** Public list of the LabelConfig fields that flow through the
 *  Setup-Script generator. Derived from the registry so the two
 *  cannot drift. Consumers (test no-leak assertion, modal rail
 *  grouping) read this instead of hard-coding the list. */
export const SETUP_SCRIPT_FIELDS = Object.keys(
  SETUP_SCRIPT_EMITTERS,
) as readonly SetupScriptField[];

export type SetupScriptField = keyof typeof SETUP_SCRIPT_EMITTERS;

export function generateSetupScript(label: LabelConfig): string {
  const tildeLines: string[] = [];
  const blockLines: string[] = [];

  for (const field of SETUP_SCRIPT_FIELDS) {
    const e = SETUP_SCRIPT_EMITTERS[field];
    const line = e.emit(label);
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
