import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
import { inputCls, labelCls } from "../ui/formStyles";
import type { PrinterProfile } from "../../types/PrinterProfile";
import {
  HEAD_CLEANING_INTERVAL_RANGE,
  MAINTENANCE_ALERT_DEFAULTS,
  MAINTENANCE_ALERT_PRINT_VALUES,
  MAINTENANCE_ALERT_TYPES,
  MAINTENANCE_ALERT_UNITS,
  MAINTENANCE_DISTANCE_MAX,
  MAINTENANCE_MESSAGE_MAX_LEN,
  isMaintenanceAlertPrint,
  isMaintenanceAlertType,
  isMaintenanceAlertUnit,
  type MaintenanceAlertType,
  type MaintenanceAlertUnit,
} from "../../types/PrinterProfile";
import {
  BoundedIntControl,
  SafeStringInput,
  ZplBoundedIntInput,
  ZplCommandLabel,
  ZplEnumSelect,
  ZplField,
  ZplSubField,
} from "./zplFieldPrimitives";

type LocMaintenance = ReturnType<typeof useT>["printerSettings"]["maintenance"];
type MaintenanceAlert = NonNullable<PrinterProfile["maintenanceAlert"]>;

const ALERT_TYPE_LABEL_KEYS = {
  H: 'alertTypeH',
  R: 'alertTypeR',
} as const satisfies Record<MaintenanceAlertType, keyof LocMaintenance>;

const ALERT_UNIT_LABEL_KEYS = {
  M: 'alertUnitsM',
  I: 'alertUnitsI',
  C: 'alertUnitsC',
} as const satisfies Record<MaintenanceAlertUnit, keyof LocMaintenance>;

/** Maintenance tab (^MA/^MI/^MW/^JH). */
export function MaintenanceTab() {
  const t = useT();
  const profile = useLabelStore((s) => s.printerProfile);
  const patchPrinterProfile = useLabelStore((s) => s.patchPrinterProfile);
  const loc = t.printerSettings.maintenance;
  const alert = profile.maintenanceAlert;
  const message = profile.maintenanceMessage;

  // Cascade between maintenanceAlert.type and maintenanceMessage.type
  // lives in patchPrinterProfile so UI call sites don't carry the
  // invariant; this helper only owns the per-field merge.
  const updateAlert = <K extends keyof MaintenanceAlert>(key: K, value: MaintenanceAlert[K]) => {
    if (!alert) return;
    patchPrinterProfile({ maintenanceAlert: { ...alert, [key]: value } });
  };

  return (
    <div className="flex flex-col gap-4">
      <ZplField>
        <ZplCommandLabel text={loc.maintenanceAlertHeading} command="^MA" />
        <div className="flex flex-col gap-2 pl-2 border-l border-border">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{loc.alertType}</label>
              <select
                className={inputCls}
                value={alert?.type ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    patchPrinterProfile({ maintenanceAlert: undefined });
                    return;
                  }
                  if (!isMaintenanceAlertType(raw)) return;
                  // First-time creation seeds defaults; subsequent edits
                  // re-spread the alert. The cross-field type cascade
                  // is enforced by patchPrinterProfile.
                  patchPrinterProfile({
                    maintenanceAlert: alert
                      ? { ...alert, type: raw }
                      : { ...MAINTENANCE_ALERT_DEFAULTS, type: raw },
                  });
                }}
              >
                <option value="">{t.printerSettings.defaultOption}</option>
                {MAINTENANCE_ALERT_TYPES.map((v) => (
                  <option key={v} value={v}>{loc[ALERT_TYPE_LABEL_KEYS[v]]}</option>
                ))}
              </select>
            </div>
            <ZplSubField label={loc.alertPrint}>
              {(id) => (
                <select
                  id={id}
                  className={inputCls}
                  value={alert?.print ?? MAINTENANCE_ALERT_DEFAULTS.print}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (isMaintenanceAlertPrint(raw)) updateAlert("print", raw);
                  }}
                  disabled={!alert}
                >
                  {MAINTENANCE_ALERT_PRINT_VALUES.map((v) => (
                    <option key={v} value={v}>{v === "Y" ? loc.alertPrintY : loc.alertPrintN}</option>
                  ))}
                </select>
              )}
            </ZplSubField>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <ZplSubField label={loc.alertThreshold}>
              {(id) => (
                <BoundedIntControl
                  id={id}
                  min={0}
                  max={MAINTENANCE_DISTANCE_MAX}
                  value={alert?.threshold}
                  disabled={!alert}
                  onChange={(threshold) => {
                    // Drop undefined (mid-typing empty); blur clamps stale state.
                    if (threshold !== undefined) updateAlert("threshold", threshold);
                  }}
                />
              )}
            </ZplSubField>
            <ZplSubField label={loc.alertFrequency}>
              {(id) => (
                <BoundedIntControl
                  id={id}
                  min={1}
                  max={MAINTENANCE_DISTANCE_MAX}
                  value={alert?.frequency}
                  disabled={!alert}
                  onChange={(frequency) => {
                    // readBoundedInt lets sub-min positives through so a
                    // user typing "1" toward "12" survives a min=2 field;
                    // schema requires >= min, so gate the commit here.
                    if (frequency !== undefined && frequency >= 1) {
                      updateAlert("frequency", frequency);
                    }
                  }}
                />
              )}
            </ZplSubField>
            <ZplSubField label={loc.alertUnits}>
              {(id) => (
                <select
                  id={id}
                  className={inputCls}
                  value={alert?.units ?? MAINTENANCE_ALERT_DEFAULTS.units}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (isMaintenanceAlertUnit(raw)) updateAlert("units", raw);
                  }}
                  disabled={!alert}
                >
                  {MAINTENANCE_ALERT_UNITS.map((v) => (
                    <option key={v} value={v}>{loc[ALERT_UNIT_LABEL_KEYS[v]]}</option>
                  ))}
                </select>
              )}
            </ZplSubField>
          </div>
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

      <ZplEnumSelect
        label={loc.earlyWarningMaintenance}
        command="^JH"
        values={['E', 'D'] as const}
        isValid={(v): v is 'E' | 'D' => v === 'E' || v === 'D'}
        value={profile.earlyWarningMaintenance}
        onChange={(earlyWarningMaintenance) => patchPrinterProfile({ earlyWarningMaintenance })}
        defaultLabel={t.printerSettings.defaultOption}
        optionLabel={(v) => v === 'E' ? loc.earlyWarningE : loc.earlyWarningD}
      />
      <span className={`${labelCls} normal-case tracking-normal text-muted/70 -mt-2`}>
        {loc.earlyWarningGateHint}
      </span>

      <ZplBoundedIntInput
        label={loc.headCleaningIntervalMeters}
        command="^JH"
        min={HEAD_CLEANING_INTERVAL_RANGE.min}
        max={HEAD_CLEANING_INTERVAL_RANGE.max}
        value={profile.headCleaningIntervalMeters}
        onChange={(headCleaningIntervalMeters) =>
          patchPrinterProfile({ headCleaningIntervalMeters })
        }
        unit={loc.alertUnitsM}
      />
      <span className={`${labelCls} normal-case tracking-normal text-muted/70 -mt-2`}>
        {loc.headCleaningIntervalHint}
      </span>

      <ZplEnumSelect
        label={loc.headColdWarning}
        command="^MW"
        values={['Y', 'N'] as const}
        isValid={(v): v is 'Y' | 'N' => v === 'Y' || v === 'N'}
        value={profile.headColdWarning}
        onChange={(headColdWarning) => patchPrinterProfile({ headColdWarning })}
        defaultLabel={t.printerSettings.defaultOption}
        optionLabel={(v) => v === 'Y' ? loc.headColdWarningOn : loc.headColdWarningOff}
      />
    </div>
  );
}

