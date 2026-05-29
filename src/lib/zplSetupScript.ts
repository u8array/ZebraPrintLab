import type { LabelConfig } from '../types/ObjectType';
import { formatRealtimeClockForZpl } from './realtimeClock';

/** Single source of truth for which `LabelConfig` fields belong on
 *  the Setup-Script output channel rather than the per-label one.
 *  Used by:
 *    - `generateSetupScript` below (sanity-check: every emitted
 *      command corresponds to an entry here)
 *    - test `zplSetupScript.test.ts` (no-leak assertion: nothing
 *      outside this list can appear in the script)
 *    - the modal's `RAIL_GROUPS` rail-grouping (Setup-Script tabs
 *      surface fields from this list)
 *  Adding a new Setup-Script command means one entry here plus the
 *  matching emit in `generateSetupScript` — the three call sites
 *  otherwise can drift silently. */
export const SETUP_SCRIPT_FIELDS = [
  'tearOffAdjust',
  'reprintAfterError',
  'headTestInterval',
  'setRealtimeClock',
  'clockFormat',
] as const satisfies readonly (keyof LabelConfig)[];

export type SetupScriptField = (typeof SETUP_SCRIPT_FIELDS)[number];

/**
 * Generates the one-shot Setup-Script output for a label config.
 *
 * Separate from `generateZPL` because the commands this emits are
 * EEPROM-persistent printer state (~TA, ^JZ, ^JT, and the upcoming
 * clock/encoding/identity commands). Re-emitting them on every
 * label would wear the printer's flash; the Setup-Script is meant
 * to be sent once when the printer is provisioned, not on every
 * print job.
 *
 * Per-label commands that *also* touch EEPROM (^MD, ^MT, ^MM, ^ML)
 * stay in `generateZPL` because they conceptually belong to "this
 * label's media setup". Instant-only commands (~SD) stay per-label
 * too — they don't write flash. The split is "should this value
 * change per print job" rather than "is the write persistent".
 *
 * Shape follows the Zebra-idiomatic split:
 *   - tilde-prefix commands (~TA) stand alone above the block
 *   - caret-prefix commands (^JZ, ^JT) live inside a wrapper
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
export function generateSetupScript(label: LabelConfig): string {
  const tildeLines: string[] = [];
  const blockLines: string[] = [];

  if (label.tearOffAdjust !== undefined) {
    // No zero-pad: ~TA accepts a signed integer (-120..+120) directly.
    // `tearOffAdjust === 0` emits `~TA0` intentionally — see the
    // default-value-emit note in the file docstring.
    tildeLines.push(`~TA${label.tearOffAdjust}`);
  }

  if (label.reprintAfterError !== undefined) {
    blockLines.push(`^JZ${label.reprintAfterError}`);
  }
  if (label.headTestInterval !== undefined) {
    blockLines.push(`^JT${label.headTestInterval}`);
  }
  if (label.setRealtimeClock !== undefined) {
    const params = formatRealtimeClockForZpl(label.setRealtimeClock);
    if (params !== null) blockLines.push(`^ST${params}`);
  }
  if (label.clockFormat !== undefined) {
    blockLines.push(`^KD${label.clockFormat}`);
  }

  if (tildeLines.length === 0 && blockLines.length === 0) return '';

  const out = [...tildeLines];
  if (blockLines.length > 0) {
    out.push('^XA', ...blockLines, '^XZ');
  }
  return out.join('\n');
}
