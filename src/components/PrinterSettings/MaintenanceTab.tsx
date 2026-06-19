import { useId } from "react";
import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
import { labelCls } from "../ui/formStyles";
import { Select } from "../ui/Select";
import type { PrinterProfile } from "../../types/PrinterProfile";
import {
  HEAD_CLEANING_INTERVAL_METERS,
  MAINTENANCE_ALERT_DEFAULTS,
  MAINTENANCE_ALERT_PRINT_VALUES,
  MAINTENANCE_ALERT_TYPES,
  MAINTENANCE_ALERT_UNITS,
  MAINTENANCE_DISTANCE_MAX_BY_TYPE,
  MAINTENANCE_MESSAGE_MAX_LEN,
  isHeadCleaningIntervalMeters,
  type HeadCleaningIntervalMeters,
  type MaintenanceAlertType,
  type MaintenanceAlertUnit,
} from "../../types/PrinterProfile";
import {
  BoundedIntControl,
  SafeStringInput,
  ZplCommandLabel,
  ZplEnumSegmented,
  ZplEnumSubCustomSelect,
  ZplField,
  ZplSubField,
} from "./zplFieldPrimitives";

type LocMaintenance = ReturnType<typeof useT>["printerSettings"]["maintenance"];
type MaintenanceAlert = NonNullable<PrinterProfile["maintenanceAlert"]>;

const ALERT_TYPE_LABEL_KEYS = {
  R: 'alertTypeR',
  C: 'alertTypeC',
} as const satisfies Record<MaintenanceAlertType, keyof LocMaintenance>;

const ALERT_UNIT_LABEL_KEYS = {
  C: 'alertUnitsC',
  I: 'alertUnitsI',
  M: 'alertUnitsM',
} as const satisfies Record<MaintenanceAlertUnit, keyof LocMaintenance>;

/** Maintenance tab (^MA/^MI/^MW/^JH). */
export function MaintenanceTab() {
  const t = useT();
  const profile = useLabelStore((s) => s.printerProfile);
  const patchPrinterProfile = useLabelStore((s) => s.patchPrinterProfile);
  const loc = t.printerSettings.maintenance;
  const alert = profile.maintenanceAlert;
  const message = profile.maintenanceMessage;

  // Type-cascade lives in patchPrinterProfile; this helper only owns the merge.
  const updateAlert = <K extends keyof MaintenanceAlert>(key: K, value: MaintenanceAlert[K]) => {
    if (!alert) return;
    patchPrinterProfile({ maintenanceAlert: { ...alert, [key]: value } });
  };

  return (
    <div className="flex flex-col gap-4">
      <ZplField>
        <ZplCommandLabel text={loc.maintenanceAlertHeading} command="^MA" />
        <ZplEnumSubCustomSelect
          label={loc.alertType}
          values={MAINTENANCE_ALERT_TYPES}
          value={alert?.type}
          defaultLabel={t.printerSettings.defaultOption}
          optionLabel={(v) => loc[ALERT_TYPE_LABEL_KEYS[v]]}
          onChange={(raw) => {
            if (!raw) {
              patchPrinterProfile({ maintenanceAlert: undefined });
              return;
            }
            // First creation seeds defaults; later edits re-spread.
            // Threshold/frequency clamp to the new type's cap so a switch
            // R→C with stale 50000 doesn't trip the schema and snap back.
            const cap = MAINTENANCE_DISTANCE_MAX_BY_TYPE[raw];
            patchPrinterProfile({
              maintenanceAlert: alert
                ? {
                  ...alert,
                  type: raw,
                  threshold: Math.min(alert.threshold, cap),
                  frequency: Math.min(alert.frequency, cap),
                }
                : { ...MAINTENANCE_ALERT_DEFAULTS, type: raw },
            });
          }}
        />
        <div
          className={`grid grid-cols-4 items-end gap-2 pl-2 mt-1 border-l-2 ${
            alert ? "border-accent/60" : "border-border/40"
          }`}
        >
          <ZplEnumSubCustomSelect
            label={loc.alertPrint}
            values={MAINTENANCE_ALERT_PRINT_VALUES}
            value={alert?.print}
            disabled={!alert}
            optionLabel={(v) => (v === "Y" ? loc.alertPrintY : loc.alertPrintN)}
            onChange={(v) => {
              if (v) updateAlert("print", v);
            }}
          />
          <ZplSubField label={loc.alertThreshold}>
            {(id) => (
              <BoundedIntControl
                id={id}
                min={0}
                max={MAINTENANCE_DISTANCE_MAX_BY_TYPE[alert?.type ?? MAINTENANCE_ALERT_DEFAULTS.type]}
                value={alert?.threshold}
                disabled={!alert}
                required={!!alert}
                onChange={(threshold) => {
                  if (threshold !== undefined) updateAlert("threshold", threshold);
                }}
              />
            )}
          </ZplSubField>
          <ZplSubField label={loc.alertFrequency}>
            {(id) => (
              <BoundedIntControl
                id={id}
                min={0}
                max={MAINTENANCE_DISTANCE_MAX_BY_TYPE[alert?.type ?? MAINTENANCE_ALERT_DEFAULTS.type]}
                value={alert?.frequency}
                disabled={!alert}
                required={!!alert}
                onChange={(frequency) => {
                  if (frequency !== undefined) updateAlert("frequency", frequency);
                }}
              />
            )}
          </ZplSubField>
          <ZplEnumSubCustomSelect
            label={loc.alertUnits}
            values={MAINTENANCE_ALERT_UNITS}
            value={alert?.units}
            disabled={!alert}
            optionLabel={(v) => loc[ALERT_UNIT_LABEL_KEYS[v]]}
            onChange={(v) => {
              if (v) updateAlert("units", v);
            }}
          />
        </div>
      </ZplField>

      <ZplField>
        <ZplCommandLabel text={loc.maintenanceMessageHeading} command="^MI" />
        <div className="flex flex-col gap-2 pl-2 border-l border-border">
          <ZplSubField label={loc.messageText}>
            {(id) => (
              <SafeStringInput
                id={id}
                maxLength={MAINTENANCE_MESSAGE_MAX_LEN}
                value={message?.text ?? ""}
                onChange={(text) => {
                  if (!text) {
                    patchPrinterProfile({ maintenanceMessage: undefined });
                    return;
                  }
                  // Type sticks to alert.type when an alert exists; otherwise
                  // falls back to the default so superRefine stays satisfied.
                  const type = message?.type ?? alert?.type ?? MAINTENANCE_ALERT_DEFAULTS.type;
                  patchPrinterProfile({ maintenanceMessage: { type, text } });
                }}
              />
            )}
          </ZplSubField>
          <span className={`${labelCls} normal-case tracking-normal text-muted/70`}>
            {loc.messageTextHint} ({MAINTENANCE_MESSAGE_MAX_LEN})
          </span>
        </div>
      </ZplField>

      <ZplEnumSegmented
        label={loc.earlyWarningMaintenance}
        command="^JH"
        values={['E', 'D'] as const}
        value={profile.earlyWarningMaintenance}
        onChange={(earlyWarningMaintenance) => patchPrinterProfile({ earlyWarningMaintenance })}
        defaultLabel={t.printerSettings.defaultOption}
        optionLabel={(v) => v === 'E' ? loc.earlyWarningE : loc.earlyWarningD}
      />
      <span className={`${labelCls} normal-case tracking-normal text-muted/70 -mt-2`}>
        {loc.earlyWarningGateHint}
      </span>

      <HeadCleaningIntervalSelect
        label={loc.headCleaningIntervalMeters}
        defaultLabel={t.printerSettings.defaultOption}
        unit={loc.alertUnitsM}
        value={profile.headCleaningIntervalMeters}
        onChange={(headCleaningIntervalMeters) =>
          patchPrinterProfile({ headCleaningIntervalMeters })
        }
      />
      <span className={`${labelCls} normal-case tracking-normal text-muted/70 -mt-2`}>
        {loc.headCleaningIntervalHint}
      </span>

      <ZplEnumSegmented
        label={loc.headColdWarning}
        command="^MW"
        values={['Y', 'N'] as const}
        value={profile.headColdWarning}
        onChange={(headColdWarning) => patchPrinterProfile({ headColdWarning })}
        defaultLabel={t.printerSettings.defaultOption}
        optionLabel={(v) => v === 'Y' ? loc.headColdWarningOn : loc.headColdWarningOff}
      />
    </div>
  );
}

function HeadCleaningIntervalSelect({
  label,
  defaultLabel,
  unit,
  value,
  onChange,
}: {
  label: string;
  defaultLabel: string;
  unit: string;
  value: HeadCleaningIntervalMeters | undefined;
  onChange: (next: HeadCleaningIntervalMeters | undefined) => void;
}) {
  const id = useId();
  return (
    <ZplField>
      <ZplCommandLabel text={label} command="^JH" htmlFor={id} />
      <Select
        id={id}
        aria-label={label}
        value={value !== undefined ? String(value) : ""}
        groups={[
          {
            options: [
              { value: "", label: defaultLabel },
              ...HEAD_CLEANING_INTERVAL_METERS.map((m) => ({
                value: String(m),
                label: `${m} ${unit}`,
              })),
            ],
          },
        ]}
        onChange={(raw) => {
          if (raw === "") { onChange(undefined); return; }
          const n = Number(raw);
          if (isHeadCleaningIntervalMeters(n)) onChange(n);
        }}
      />
    </ZplField>
  );
}
