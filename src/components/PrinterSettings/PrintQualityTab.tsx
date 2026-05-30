import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
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
  BoundedIntControl,
  ZplBoundedIntInput,
  ZplCheckbox,
  ZplCommandLabel,
  ZplEnumSelect,
  ZplField,
  ZplSubField,
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
  const profile = useLabelStore((s) => s.printerProfile);
  const patchPrinterProfile = useLabelStore((s) => s.patchPrinterProfile);
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
          three share the same 2..14 ips range and one ^PR command,
          so group them under one ZplField + tag header. */}
      <ZplField>
        <ZplCommandLabel text={loc.printSpeedHeading} command="^PR" />
        <div className="grid grid-cols-3 gap-2">
          <ZplSubField label={loc.printSpeed}>
            {(id) => (
              <BoundedIntControl
                id={id}
                min={SPEED_RANGE.min}
                max={SPEED_RANGE.max}
                value={label.printSpeed}
                onChange={(v) => setLabelConfig({ printSpeed: v })}
              />
            )}
          </ZplSubField>
          <ZplSubField label={loc.slewSpeed}>
            {(id) => (
              <BoundedIntControl
                id={id}
                min={SPEED_RANGE.min}
                max={SPEED_RANGE.max}
                value={label.slewSpeed}
                onChange={(v) => setLabelConfig({ slewSpeed: v })}
              />
            )}
          </ZplSubField>
          <ZplSubField label={loc.backfeedSpeed}>
            {(id) => (
              <BoundedIntControl
                id={id}
                min={SPEED_RANGE.min}
                max={SPEED_RANGE.max}
                value={label.backfeedSpeed}
                onChange={(v) => setLabelConfig({ backfeedSpeed: v })}
              />
            )}
          </ZplSubField>
        </div>
      </ZplField>

      {/* ^MD permanent darkness — the EEPROM-persistent set value. */}
      <ZplBoundedIntInput
        label={loc.darknessPermanent}
        command="^MD"
        min={DARKNESS_PERMANENT_RANGE.min}
        max={DARKNESS_PERMANENT_RANGE.max}
        value={label.darkness}
        onChange={(v) => setLabelConfig({ darkness: v })}
      />

      {/* ~SD instant darkness override. Separate row from ^MD so
          each command keeps its own tag (the earlier shared-^MD
          grid mis-labelled the ~SD slot as ^MD). */}
      <ZplBoundedIntInput
        label={loc.darknessInstant}
        command="~SD"
        min={DARKNESS_INSTANT_RANGE.min}
        max={DARKNESS_INSTANT_RANGE.max}
        value={label.instantDarkness}
        onChange={(v) => setLabelConfig({ instantDarkness: v })}
      />

      {/* Printer default for ^JZ is "Y" (reprint enabled). The
          unchecked state must explicitly emit "N", otherwise the
          printer falls back to its default and the user cannot
          actually disable reprint from this UI. */}
      <ZplCheckbox
        text={loc.reprintAfterError}
        command="^JZ"
        checked={profile.reprintAfterError !== "N"}
        onChange={(v) => patchPrinterProfile({ reprintAfterError: v ? "Y" : "N" })}
      />

      <ZplBoundedIntInput
        label={loc.headTestInterval}
        command="^JT"
        min={HEAD_TEST_INTERVAL_RANGE.min}
        max={HEAD_TEST_INTERVAL_RANGE.max}
        value={profile.headTestInterval}
        onChange={(v) => patchPrinterProfile({ headTestInterval: v })}
      />

      <ZplBoundedIntInput
        label={loc.tearOffAdjust}
        command="~TA"
        min={TEAR_OFF_ADJUST_RANGE.min}
        max={TEAR_OFF_ADJUST_RANGE.max}
        value={profile.tearOffAdjust}
        onChange={(v) => patchPrinterProfile({ tearOffAdjust: v })}
        unit={t.printerSettings.dotsUnit}
      />
    </div>
  );
}
