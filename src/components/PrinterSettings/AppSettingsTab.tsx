import { useId } from "react";
import { useT } from "../../hooks/useT";
import { useLabelStore } from "../../store/labelStore";
import { isDesktopShell } from "../../lib/platform";
import { formatTemplate } from "../../lib/formatTemplate";
import { labelCls } from "../ui/formStyles";
import { DangerConfirmButton } from "../ui/DangerConfirmButton";
import { isDefaultLabelaryHost } from "../../lib/labelary";

function SettingToggle({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  const hintId = useId();
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="accent-accent"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hint ? hintId : undefined}
        />
        <span className={labelCls}>{label}</span>
      </label>
      {hint && <span id={hintId} className="text-[10px] text-muted pl-6">{hint}</span>}
    </div>
  );
}

/** Client-side app preferences (not printer/ZPL config): power-user mode,
 *  smart-snap, the Labelary privacy opt-in, and a scoped settings reset. */
export function AppSettingsTab() {
  const t = useT();
  const loc = t.printerSettings.app;

  const showZplCommands = useLabelStore((s) => s.showZplCommands);
  const setShowZplCommands = useLabelStore((s) => s.setShowZplCommands);
  const smartSnapEnabled = useLabelStore((s) => s.canvasSettings.smartSnapEnabled);
  const setCanvasSettings = useLabelStore((s) => s.setCanvasSettings);
  const labelaryAvailable = useLabelStore((s) => s.thirdParty.labelary);
  const labelaryConsent = useLabelStore((s) => s.labelaryNoticeAcknowledged);
  const acknowledgeLabelaryNotice = useLabelStore((s) => s.acknowledgeLabelaryNotice);
  const revokeLabelaryNotice = useLabelStore((s) => s.revokeLabelaryNotice);
  const resetSettings = useLabelStore((s) => s.resetSettings);
  const appUpdate = useLabelStore((s) => s.appUpdate);
  const checkForAppUpdate = useLabelStore((s) => s.checkForAppUpdate);
  const installAppUpdate = useLabelStore((s) => s.installAppUpdate);
  const relaunchApp = useLabelStore((s) => s.relaunchApp);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted">{loc.editorHeading}</h3>
        <SettingToggle
          checked={showZplCommands}
          onChange={setShowZplCommands}
          label={loc.powerUser}
          hint={loc.powerUserHint}
        />
        <SettingToggle
          checked={smartSnapEnabled}
          onChange={(v) => setCanvasSettings({ smartSnapEnabled: v })}
          label={loc.smartSnap}
          hint={loc.smartSnapHint}
        />
      </section>

      {labelaryAvailable && (
        <section className="flex flex-col gap-2">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted">{loc.privacyHeading}</h3>
          {/* Consent only gates the public host; a custom endpoint is the
              operator's own, so the toggle would be inert there. */}
          {isDefaultLabelaryHost() && (
            <SettingToggle
              checked={labelaryConsent}
              onChange={(v) => (v ? acknowledgeLabelaryNotice() : revokeLabelaryNotice())}
              label={loc.labelary}
            />
          )}
          <p className="text-[10px] text-muted leading-relaxed max-w-md">
            {isDefaultLabelaryHost() ? (
              <>
                {t.output.previewNoticeBody}{" "}
                {/* The plans/retention link is about the public service; a
                    custom endpoint is the operator's own, so omit it there. */}
                <a
                  href="https://labelary.com/service.html#pricing"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  {t.output.previewNoticePrivacyLink}
                </a>
              </>
            ) : (
              loc.labelaryHint
            )}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted">{loc.updatesHeading}</h3>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-muted">
            {formatTemplate(loc.versionFmt, { version: __APP_VERSION__ })}
          </span>
          {isDesktopShell && appUpdate.phase === "available" && (
            <>
              <span className="font-mono text-[10px] text-text">
                {formatTemplate(t.app.updateAvailableFmt, { version: appUpdate.version })}
              </span>
              <button
                onClick={() => void installAppUpdate()}
                className="px-2 py-1 rounded text-[10px] font-mono bg-accent text-bg hover:opacity-90 transition-opacity"
              >
                {t.app.updateInstall}
              </button>
            </>
          )}
          {isDesktopShell && appUpdate.phase === "installed" && (
            <button
              onClick={() => void relaunchApp()}
              className="px-2 py-1 rounded text-[10px] font-mono bg-accent text-bg hover:opacity-90 transition-opacity"
            >
              {t.app.updateRestart}
            </button>
          )}
          {isDesktopShell && appUpdate.phase !== "available" && appUpdate.phase !== "installed" && (
            <button
              onClick={() => void checkForAppUpdate(true)}
              disabled={appUpdate.phase === "checking" || appUpdate.phase === "installing"}
              className="px-2 py-1 rounded text-[10px] font-mono border border-border bg-surface-2 hover:bg-border text-text transition-colors disabled:opacity-40"
            >
              {appUpdate.phase === "checking" ? loc.checkingUpdates : loc.checkUpdates}
            </button>
          )}
        </div>
        {appUpdate.phase === "upToDate" && (
          <span className="text-[10px] text-muted">{loc.upToDate}</span>
        )}
        {appUpdate.phase === "installing" && (
          <span className="text-[10px] text-muted">{t.app.updateInstalling}</span>
        )}
        {appUpdate.phase === "installed" && (
          <span className="text-[10px] text-muted">{t.app.updateInstalled}</span>
        )}
        {appUpdate.phase === "error" && (
          <span className="text-[10px] text-red-400">
            {formatTemplate(t.app.updateErrorFmt, { error: appUpdate.message })}
          </span>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted">{loc.resetHeading}</h3>
        <span className="text-[10px] text-muted max-w-md">{loc.resetHint}</span>
        <DangerConfirmButton
          label={loc.reset}
          confirmLabel={loc.resetConfirm}
          cancelLabel={loc.resetCancel}
          onConfirm={resetSettings}
        />
      </section>
    </div>
  );
}
