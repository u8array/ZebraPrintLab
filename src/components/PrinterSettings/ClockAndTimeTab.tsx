import { useId } from "react";
import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
import { inputCls, labelCls } from "../ui/formStyles";
import {
  CLOCK_FORMAT_VALUES,
  CLOCK_LANGUAGE_VALUES,
  CLOCK_MODE_VALUES,
  CLOCK_TOLERANCE_DEFAULT,
  CLOCK_TOLERANCE_RANGE,
  isClockFormat,
  isClockLanguage,
  isClockMode,
  type ClockFormat,
  type ClockLanguage,
  type ClockMode,
} from "../../types/ObjectType";
import {
  BoundedIntControl,
  ZplCommandLabel,
  ZplEnumSelect,
  ZplEnumSubSelect,
  ZplField,
  ZplSubField,
} from "./zplFieldPrimitives";

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

/** Tab 3 of the Printer Settings Modal — clock/time setup commands.
 *  All three live in the Setup-Script output (EEPROM-persistent),
 *  not the per-label ZPL block. ^ST is modelled as a static user-
 *  typed value via HTML5 datetime-local, so generated scripts stay
 *  reproducible (no live now-snapshot on every copy/export). */
export function ClockAndTimeTab() {
  const t = useT();
  const label = useLabelStore((s) => s.label);
  const setLabelConfig = useLabelStore((s) => s.setLabelConfig);
  const loc = t.printerSettings.clockTime;
  const clockId = useId();
  const modeId = useId();

  return (
    <div className="flex flex-col gap-4">
      {/* ^ST: hand-rolled instead of going through a primitive, since
          datetime-local is the only such input in the modal and
          adding a primitive for one caller is YAGNI. */}
      <ZplField>
        <ZplCommandLabel text={loc.setRealtimeClock} command="^ST" htmlFor={clockId} />
        <input
          id={clockId}
          type="datetime-local"
          step="1"
          className={inputCls}
          value={label.setRealtimeClock ?? ""}
          onChange={(e) =>
            setLabelConfig({ setRealtimeClock: e.target.value || undefined })
          }
        />
        <span className={labelCls + " normal-case tracking-normal text-muted/70"}>
          {loc.setRealtimeClockHint}
        </span>
      </ZplField>

      <ZplEnumSelect
        label={loc.clockFormat}
        command="^KD"
        values={CLOCK_FORMAT_VALUES}
        isValid={isClockFormat}
        value={label.clockFormat}
        onChange={(v) => setLabelConfig({ clockFormat: v })}
        defaultLabel={t.printerSettings.defaultOption}
        optionLabel={(m) => loc[CLOCK_FORMAT_LABEL_KEYS[m]]}
      />

      {/* All three ^SL inputs live under one parent tag — mode +
          (conditional) tolerance share the first positional slot,
          language is the second. ZplSubField keeps the per-row
          labels without duplicating the ^SL command tag (same
          pattern as ^KN name+description in IdentityTab and ^PR
          triple in PrintQualityTab). */}
      <ZplField>
        <ZplCommandLabel text={loc.clockMode} command="^SL" htmlFor={modeId} />
        <select
          id={modeId}
          className={inputCls}
          value={label.clockMode ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            const nextMode = isClockMode(v) ? v : undefined;
            // Schema's cross-field rule pairs `clockMode === 'TOL'`
            // with a defined `clockTolerance` (and vice versa). Seed
            // the default the moment the user picks TOL, and clear
            // the tolerance the moment they leave TOL — without
            // this the store would briefly hold an invalid combo
            // (TOL without tolerance) which the schema rejects.
            const nextTolerance = nextMode === 'TOL'
              ? label.clockTolerance ?? CLOCK_TOLERANCE_DEFAULT
              : undefined;
            setLabelConfig({ clockMode: nextMode, clockTolerance: nextTolerance });
          }}
        >
          <option value="">{t.printerSettings.defaultOption}</option>
          {CLOCK_MODE_VALUES.map((m) => (
            <option key={m} value={m}>{loc[CLOCK_MODE_LABEL_KEYS[m]]}</option>
          ))}
        </select>
        {label.clockMode === 'TOL' && (
          <ZplSubField label={loc.clockTolerance}>
            {(id) => (
              <BoundedIntControl
                id={id}
                min={CLOCK_TOLERANCE_RANGE.min}
                max={CLOCK_TOLERANCE_RANGE.max}
                value={label.clockTolerance}
                onChange={(v) => setLabelConfig({ clockTolerance: v })}
              />
            )}
          </ZplSubField>
        )}
        <ZplEnumSubSelect
          label={loc.clockLanguage}
          values={CLOCK_LANGUAGE_VALUES}
          isValid={isClockLanguage}
          value={label.clockLanguage}
          onChange={(v) => setLabelConfig({ clockLanguage: v })}
          defaultLabel={t.printerSettings.defaultOption}
          optionLabel={(m) => `${m} – ${loc[CLOCK_LANGUAGE_LABEL_KEYS[m]]}`}
        />
        <span className={`${labelCls} normal-case tracking-normal text-muted/70`}>
          {loc.clockSlPersistenceHint}
        </span>
      </ZplField>
    </div>
  );
}
