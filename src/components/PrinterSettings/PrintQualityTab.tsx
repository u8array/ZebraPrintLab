import { useId } from "react";
import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
import { inputCls, labelCls } from "../Properties/styles";
import { clampBoundedInt, readBoundedInt } from "../../lib/inputParse";
import {
  DARKNESS_INSTANT_RANGE,
  DARKNESS_PERMANENT_RANGE,
  HEAD_TEST_INTERVAL_RANGE,
  PRINT_ORIENTATION_VALUES,
  SPEED_RANGE,
  TEAR_OFF_ADJUST_RANGE,
  isPrintOrientation,
  type PrintOrientation,
} from "../../types/ObjectType";
import {
  ZplBoundedIntInput,
  ZplCheckbox,
  ZplCommandLabel,
  ZplEnumSelect,
  ZplField,
} from "./zplFieldPrimitives";

type LocPrintQuality = ReturnType<typeof useT>["printerSettings"]["printQuality"];

const ORIENTATION_LABEL_KEYS = {
  N: "printOrientationN",
  I: "printOrientationI",
} as const satisfies Record<PrintOrientation, keyof LocPrintQuality>;

/** Tab 2 of the Printer Settings Modal. Houses everything that
 *  controls per-label print quality: orientation, mirror, speed,
 *  darkness, plus three new commands (^JZ reprint-after-error,
 *  ^JT head-test interval, ~TA tear-off adjust).
 *
 *  Caveat: ^JZ / ^JT / ~TA are persistent in the printer's EEPROM
 *  per the ZPL spec, so emitting them on every label writes flash
 *  on every print. The Printer Settings Modal epic plans to split
 *  per-label commands from setup-script-only commands; until that
 *  ships, these three live in the per-label generator path. See
 *  the project_ticket_printer_settings_modal memory for the
 *  follow-up. */
export function PrintQualityTab() {
  const t = useT();
  const label = useLabelStore((s) => s.label);
  const setLabelConfig = useLabelStore((s) => s.setLabelConfig);
  const loc = t.printerSettings.printQuality;

  return (
    <div className="flex flex-col gap-4">
      <ZplEnumSelect
        label={loc.printOrientation}
        command="^PO"
        values={PRINT_ORIENTATION_VALUES}
        isValid={isPrintOrientation}
        value={label.printOrientation}
        onChange={(v) => setLabelConfig({ printOrientation: v })}
        defaultLabel={t.printerSettings.defaultOption}
        optionLabel={(m) => loc[ORIENTATION_LABEL_KEYS[m]]}
      />

      <ZplCheckbox
        text={loc.mirror}
        command="^PM"
        checked={label.mirror === "Y"}
        onChange={(v) => setLabelConfig({ mirror: v ? "Y" : undefined })}
      />

      {/* Speed triple: ^PR a,b,c — print / slew / backfeed. All
          three share the same 2..14 ips range. Hand-rolled as a
          grid of bare inputs because they share one ZPL command
          tag (^PR) and one heading (the ZplBoundedIntInput
          primitive renders one tag per call). */}
      <ZplField>
        <ZplCommandLabel text={loc.printSpeedHeading} command="^PR" />
        <div className="grid grid-cols-3 gap-2">
          <SpeedSlot
            label={loc.printSpeed}
            value={label.printSpeed}
            onChange={(v) => setLabelConfig({ printSpeed: v })}
          />
          <SpeedSlot
            label={loc.slewSpeed}
            value={label.slewSpeed}
            onChange={(v) => setLabelConfig({ slewSpeed: v })}
          />
          <SpeedSlot
            label={loc.backfeedSpeed}
            value={label.backfeedSpeed}
            onChange={(v) => setLabelConfig({ backfeedSpeed: v })}
          />
        </div>
      </ZplField>

      {/* Darkness pair: ^MD permanent + ~SD instant override.
          Two commands but one logical concept; group under one
          tag header instead of two separate ZplBoundedIntInput
          rows. */}
      <ZplField>
        <ZplCommandLabel text={loc.darknessHeading} command="^MD" />
        <div className="grid grid-cols-2 gap-2">
          <BoundedIntSlot
            label={loc.darknessPermanent}
            min={DARKNESS_PERMANENT_RANGE.min}
            max={DARKNESS_PERMANENT_RANGE.max}
            value={label.darkness}
            onChange={(v) => setLabelConfig({ darkness: v })}
          />
          <BoundedIntSlot
            label={loc.darknessInstant}
            min={DARKNESS_INSTANT_RANGE.min}
            max={DARKNESS_INSTANT_RANGE.max}
            value={label.instantDarkness}
            onChange={(v) => setLabelConfig({ instantDarkness: v })}
          />
        </div>
      </ZplField>

      {/* Drucker-Default für ^JZ ist "Y" (reprint aktiv). Unchecked
          muss daher explizit "N" emittieren, sonst fällt der
          Drucker auf den Default zurück und der User kann reprint
          gar nicht abschalten. */}
      <ZplCheckbox
        text={loc.reprintAfterError}
        command="^JZ"
        checked={label.reprintAfterError !== "N"}
        onChange={(v) => setLabelConfig({ reprintAfterError: v ? "Y" : "N" })}
      />

      <ZplBoundedIntInput
        label={loc.headTestInterval}
        command="^JT"
        min={HEAD_TEST_INTERVAL_RANGE.min}
        max={HEAD_TEST_INTERVAL_RANGE.max}
        value={label.headTestInterval}
        onChange={(v) => setLabelConfig({ headTestInterval: v })}
      />

      <ZplBoundedIntInput
        label={loc.tearOffAdjust}
        command="~TA"
        min={TEAR_OFF_ADJUST_RANGE.min}
        max={TEAR_OFF_ADJUST_RANGE.max}
        value={label.tearOffAdjust}
        onChange={(v) => setLabelConfig({ tearOffAdjust: v })}
        unit={t.printerSettings.dotsUnit}
      />
    </div>
  );
}

/** Speed-slot input: one cell of the ^PR triple. Same shape as
 *  the darkness slots but with the SPEED_RANGE pre-applied since
 *  all three ^PR positions share the 2..14 ips range. */
function SpeedSlot({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <BoundedIntSlot
      label={label}
      min={SPEED_RANGE.min}
      max={SPEED_RANGE.max}
      value={value}
      onChange={onChange}
    />
  );
}

/** Bare bounded-int cell for grids that share one ZPL tag across
 *  multiple positional params (^PR triple, ^MD pair). The outer
 *  ZplField already carries the tag; this control just labels its
 *  own slot. ZplBoundedIntInput would render a tag per call. */
function BoundedIntSlot({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        className={inputCls}
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => onChange(readBoundedInt(e.target.value, min, max))}
        onBlur={(e) => onChange(clampBoundedInt(e.target.value, min, max))}
      />
    </div>
  );
}
