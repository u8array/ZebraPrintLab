import { useId } from "react";
import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
import { inputCls, labelCls } from "../ui/formStyles";
import { CLOCK_FORMAT_VALUES, CLOCK_LANGUAGE_VALUES, CLOCK_MODE_VALUES, CLOCK_TOLERANCE_DEFAULT, CLOCK_TOLERANCE_RANGE, isClockMode, type ClockFormat, type ClockLanguage, type ClockMode } from "../../types/PrinterProfile";
import {
  BoundedIntControl,
  ZplCommandLabel,
  ZplEnumCustomSelect,
  ZplEnumSubCustomSelect,
  ZplField,
  ZplSubField,
} from "./zplFieldPrimitives";
import { Select } from "../ui/Select";

type LocClockTime = ReturnType<typeof useT>["printerSettings"]["clockTime"];

/** Explicit value → locale-key maps for all three enums in this
 *  tab. `satisfies` makes both a missing enum-value entry (here)
 *  and a missing locale key (in the locale shape) compile errors. */
const CLOCK_FORMAT_LABEL_KEYS = {
  '0': 'clockFormat0',
  '1': 'clockFormat1',
  '2': 'clockFormat2',
  '3': 'clockFormat3',
} as const satisfies Record<ClockFormat, keyof LocClockTime>;

const CLOCK_MODE_LABEL_KEYS = {
  S: 'clockModeS',
  T: 'clockModeT',
  TOL: 'clockModeTOL',
} as const satisfies Record<ClockMode, keyof LocClockTime>;

const CLOCK_LANGUAGE_LABEL_KEYS = {
  '1': 'clockLanguage1', '2': 'clockLanguage2', '3': 'clockLanguage3',
  '4': 'clockLanguage4', '5': 'clockLanguage5', '6': 'clockLanguage6',
  '7': 'clockLanguage7', '8': 'clockLanguage8', '9': 'clockLanguage9',
  '10': 'clockLanguage10', '11': 'clockLanguage11', '12': 'clockLanguage12',
  '13': 'clockLanguage13',
} as const satisfies Record<ClockLanguage, keyof LocClockTime>;

/** Tab 3 of the Printer Settings Modal; clock/time setup commands.
 *  All three live in the Setup-Script output (EEPROM-persistent),
 *  not the per-label ZPL block. ^ST is modelled as a static user-
 *  typed value via HTML5 datetime-local, so generated scripts stay
 *  reproducible (no live now-snapshot on every copy/export). */
export function ClockAndTimeTab() {
  const t = useT();
  const profile = useLabelStore((s) => s.printerProfile);
  const patchPrinterProfile = useLabelStore((s) => s.patchPrinterProfile);
  const loc = t.printerSettings.clockTime;
  const clockId = useId();
  const modeId = useId();

  return (
    // gap-3 (not gap-4) so the tab fits inside the modal's ~290px form
    // budget even when TOL mode expands the ^SL sub-block. With gap-4
    // the TOL state spills past the docked preview into a scroll, and
    // the scrollbar inside a panel that's bordered top + bottom by
    // fixed UI is easy to miss.
    <div className="flex flex-col gap-3">
      {/* ^ST: two modes for the real-time-clock value.
          - Static: user types a value, generator emits it verbatim
            on every export (reproducible Setup-Script).
          - Live: user toggles the checkbox, generator captures the
            current wall-clock time at every export (Setup-Script
            actually "sets the clock to now"; not reproducible).
          The checkbox is colocated with the input so the active
          mode is visible at a glance. The input is disabled while
          live mode is on, but the stored value is kept so flipping
          back does not lose the typed value. */}
      <ZplField>
        <ZplCommandLabel text={loc.setRealtimeClock} command="^ST" htmlFor={clockId} />
        <input
          id={clockId}
          type="datetime-local"
          step="1"
          className={`${inputCls} disabled:opacity-40 disabled:cursor-not-allowed`}
          value={profile.setRealtimeClock ?? ""}
          disabled={!!profile.useCurrentTimeForClock}
          onChange={(e) =>
            patchPrinterProfile({ setRealtimeClock: e.target.value || undefined })
          }
        />
        <label className="flex items-center gap-2 mt-1 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={!!profile.useCurrentTimeForClock}
            onChange={(e) =>
              patchPrinterProfile({ useCurrentTimeForClock: e.target.checked || undefined })
            }
          />
          <span className="text-xs text-text">{loc.clockUseCurrentTime}</span>
        </label>
        <span className={labelCls + " normal-case tracking-normal text-muted/70"}>
          {loc.setRealtimeClockHint}
        </span>
      </ZplField>

      <ZplEnumCustomSelect
        label={loc.clockFormat}
        command="^KD"
        values={CLOCK_FORMAT_VALUES}
        value={profile.clockFormat}
        onChange={(v) => patchPrinterProfile({ clockFormat: v })}
        defaultLabel={t.printerSettings.defaultOption}
        optionLabel={(m) => loc[CLOCK_FORMAT_LABEL_KEYS[m]]}
      />

      {/* All three ^SL inputs live under one parent tag; mode +
          (conditional) tolerance share the first positional slot,
          language is the second. ZplSubField keeps the per-row
          labels without duplicating the ^SL command tag (same
          pattern as ^KN name+description in IdentityTab and ^PR
          triple in PrintQualityTab). */}
      <ZplField>
        <ZplCommandLabel text={loc.clockMode} command="^SL" htmlFor={modeId} />
        <Select
          id={modeId}
          aria-label={loc.clockMode}
          value={profile.clockMode ?? ""}
          groups={[
            {
              options: [
                { value: "", label: t.printerSettings.defaultOption },
                ...CLOCK_MODE_VALUES.map((m) => ({
                  value: m,
                  label: loc[CLOCK_MODE_LABEL_KEYS[m]],
                  badge: m,
                })),
              ],
            },
          ]}
          onChange={(v) => {
            const nextMode = isClockMode(v) ? v : undefined;
            // Schema's cross-field rule pairs `clockMode === 'TOL'`
            // with a defined `clockTolerance` (and vice versa). Seed
            // the default the moment the user picks TOL, and clear
            // the tolerance the moment they leave TOL; without
            // this the store would briefly hold an invalid combo
            // (TOL without tolerance) which the schema rejects.
            const nextTolerance = nextMode === 'TOL'
              ? profile.clockTolerance ?? CLOCK_TOLERANCE_DEFAULT
              : undefined;
            patchPrinterProfile({ clockMode: nextMode, clockTolerance: nextTolerance });
          }}
        />
        {profile.clockMode === 'TOL' && (
          <ZplSubField label={loc.clockTolerance}>
            {(id) => (
              <BoundedIntControl
                id={id}
                min={CLOCK_TOLERANCE_RANGE.min}
                max={CLOCK_TOLERANCE_RANGE.max}
                value={profile.clockTolerance}
                // Required while clockMode='TOL': empty blur snaps the
                // draft back to the last committed value with no patch
                // sent, so the input stays in sync with the store.
                required
                onChange={(v) => patchPrinterProfile({ clockTolerance: v })}
              />
            )}
          </ZplSubField>
        )}
        <ZplEnumSubCustomSelect
          label={loc.clockLanguage}
          values={CLOCK_LANGUAGE_VALUES}
          value={profile.clockLanguage}
          onChange={(v) => patchPrinterProfile({ clockLanguage: v })}
          defaultLabel={t.printerSettings.defaultOption}
          optionLabel={(m) => loc[CLOCK_LANGUAGE_LABEL_KEYS[m]]}
        />
        <span className={`${labelCls} normal-case tracking-normal text-muted/70`}>
          {loc.clockSlPersistenceHint}
        </span>
      </ZplField>
    </div>
  );
}
