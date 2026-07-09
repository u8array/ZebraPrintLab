import { useState } from "react";
import { useT } from "../../hooks/useT";
import { useLabelStore, selectEffectivePreviewProvider } from "../../store/labelStore";
import { isDesktopShell } from "../../lib/platform";
import { isDefaultLabelaryHost } from "../../lib/labelary";
import { getPrinterAddress, setPrinterAddress } from "../../lib/printerAddress";
import { labelCls, inputCls } from "../ui/formStyles";
import type { PreviewProvider } from "../../store/slices/uiSlice";

function ProviderOption({ value, current, onSelect, label, hint, disabled }: {
  value: PreviewProvider;
  current: PreviewProvider;
  onSelect: (v: PreviewProvider) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className={`flex items-center gap-2 ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
        <input
          type="radio"
          name="preview-provider"
          className="accent-accent"
          checked={current === value}
          disabled={disabled}
          onChange={() => onSelect(value)}
        />
        <span className={labelCls}>{label}</span>
      </label>
      {hint && <span className="text-[10px] text-muted pl-6">{hint}</span>}
    </div>
  );
}

/** Preview configuration: which renderer draws the overlay (Labelary's
 *  software approximation vs the connected printer's own firmware) plus the
 *  Labelary privacy consent and the printer's network address. */
export function PreviewSettingsTab() {
  const t = useT();
  const loc = t.printerSettings.preview;

  // Effective (not raw) provider: a persisted 'printer' choice degrades to
  // Labelary in the web build, so the radio reflects what actually renders.
  const provider = useLabelStore(selectEffectivePreviewProvider);
  const setProvider = useLabelStore((s) => s.setPreviewProvider);
  const labelaryAvailable = useLabelStore((s) => s.thirdParty.labelary);
  const labelaryConsent = useLabelStore((s) => s.labelaryNoticeAcknowledged);
  const acknowledgeLabelaryNotice = useLabelStore((s) => s.acknowledgeLabelaryNotice);
  const revokeLabelaryNotice = useLabelStore((s) => s.revokeLabelaryNotice);

  // Address is shared with the print dialog via localStorage, not the store;
  // local state mirrors it for controlled inputs, persisted on blur.
  const [address, setAddress] = useState(() => {
    const a = getPrinterAddress();
    return { host: a.host, port: String(a.port) };
  });
  const persistAddress = () => setPrinterAddress(address.host.trim(), address.port);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted">{loc.providerHeading}</h3>
        <ProviderOption
          value="labelary"
          current={provider}
          onSelect={setProvider}
          label={loc.providerLabelary}
          disabled={!labelaryAvailable}
        />
        <ProviderOption
          value="printer"
          current={provider}
          onSelect={setProvider}
          label={loc.providerPrinter}
          hint={isDesktopShell ? loc.providerPrinterHint : loc.providerPrinterDesktopOnly}
          disabled={!isDesktopShell}
        />
      </section>

      {provider === "printer" && isDesktopShell && (
        <section className="flex flex-col gap-2">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted">{loc.printerAddressHeading}</h3>
          <div className="flex gap-2 max-w-md">
            <div className="flex-1 flex flex-col gap-1">
              <label className={labelCls}>{t.zebraPrint.ipAddress}</label>
              <input
                type="text"
                value={address.host}
                onChange={(e) => setAddress((a) => ({ ...a, host: e.target.value }))}
                onBlur={persistAddress}
                placeholder="192.168.1.100"
                className={inputCls}
              />
            </div>
            <div className="w-24 flex flex-col gap-1">
              <label className={labelCls}>{t.zebraPrint.port}</label>
              <input
                type="number"
                min={1}
                max={65535}
                value={address.port}
                onChange={(e) => setAddress((a) => ({ ...a, port: e.target.value }))}
                onBlur={persistAddress}
                className={inputCls}
              />
            </div>
          </div>
          <span className="text-[10px] text-muted max-w-md">{loc.printerAddressHint}</span>
        </section>
      )}

      {labelaryAvailable && (
        <section className="flex flex-col gap-2">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted">{loc.privacyHeading}</h3>
          {/* Consent only gates the public host; a custom endpoint is the
              operator's own, so the toggle would be inert there. */}
          {isDefaultLabelaryHost() && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-accent"
                checked={labelaryConsent}
                onChange={(e) => (e.target.checked ? acknowledgeLabelaryNotice() : revokeLabelaryNotice())}
              />
              <span className={labelCls}>{loc.labelaryConsent}</span>
            </label>
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
    </div>
  );
}
