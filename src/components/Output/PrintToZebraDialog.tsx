import { useState, useEffect, useCallback } from "react";
import { XMarkIcon } from "@heroicons/react/16/solid";
import { useT } from "../../hooks/useT";
import { DialogShell } from "../ui/DialogShell";
import { Select } from "../ui/Select";
import {
  discoverBrowserPrintDevices,
  sendViaBrowserPrint,
  sendViaNetwork,
  type BrowserPrintDevice,
} from "../../lib/zebraPrint";
import { isDesktopShell } from "../../lib/platform";
import { listLocalPrinters, sendZplLocal, isLikelyZebra, type LocalPrinter } from "../../lib/localPrint";
import { listUsbPrinters, sendZplUsb, setupUsbAccess, isLikelyZebra as isUsbZebra, type UsbPrinter } from "../../lib/usbPrint";

const LS_IP = "zebra_print_ip";
const LS_PORT = "zebra_print_port";
const LS_PRINTER_UID = "zebra_print_uid";
const LS_LOCAL_PRINTER = "zebra_print_local";
const LS_USB = "zebra_print_usb";

type Tab = "network" | "browserprint" | "local" | "usb";
interface Status { type: "idle" | "sending" | "success" | "error"; message?: string }

function StatusMessage({ status }: { status: Status }) {
  if (status.type === "idle" || status.type === "sending") return null;
  return (
    <p className={`font-mono text-[10px] ${status.type === "success" ? "text-green-400" : "text-red-400"}`}>
      {status.message}
    </p>
  );
}

interface Props {
  zpl: string;
  onClose: () => void;
}

export function PrintToZebraDialog({ zpl, onClose }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("network");

  // Network tab state
  const [ip, setIp] = useState(() => localStorage.getItem(LS_IP) ?? "");
  const [port, setPort] = useState(() => localStorage.getItem(LS_PORT) ?? "9100");
  const [netStatus, setNetStatus] = useState<Status>({ type: "idle" });

  // Browser Print tab state
  const [devices, setDevices] = useState<BrowserPrintDevice[]>([]);
  const [selectedUid, setSelectedUid] = useState<string>(
    () => localStorage.getItem(LS_PRINTER_UID) ?? "",
  );
  const [bpStatus, setBpStatus] = useState<Status>({ type: "idle" });
  const [discovering, setDiscovering] = useState(false);

  // Local printer (OS spooler) tab state; desktop shell only.
  const [localPrinters, setLocalPrinters] = useState<LocalPrinter[]>([]);
  const [selectedLocal, setSelectedLocal] = useState<string>(
    () => localStorage.getItem(LS_LOCAL_PRINTER) ?? "",
  );
  const [localStatus, setLocalStatus] = useState<Status>({ type: "idle" });
  // Starts loading on desktop (the effect enumerates on mount); false on web.
  const [loadingLocal, setLoadingLocal] = useState(isDesktopShell);

  // USB printer tab state; desktop shell only.
  const [usbPrinters, setUsbPrinters] = useState<UsbPrinter[]>([]);
  const [selectedUsb, setSelectedUsb] = useState<string>(() => localStorage.getItem(LS_USB) ?? "");
  const [usbStatus, setUsbStatus] = useState<Status>({ type: "idle" });
  const [loadingUsb, setLoadingUsb] = useState(isDesktopShell);
  // Tracks the last USB send being permission-denied, so the setup affordance
  // survives locale changes and a cancelled polkit prompt.
  const [usbNeedsSetup, setUsbNeedsSetup] = useState(false);

  // Enumerate OS print queues once on mount; the web build has no spooler.
  useEffect(() => {
    if (!isDesktopShell) return;
    let cancelled = false;
    listLocalPrinters()
      .then((printers) => {
        if (cancelled) return;
        setLocalPrinters(printers);
        setSelectedLocal((cur) =>
          cur && printers.some((p) => p.system_name === cur) ? cur : printers[0]?.system_name ?? "",
        );
      })
      .catch((e: unknown) => {
        // A failed enumeration must be visible, not a silent empty list.
        if (!cancelled) {
          setLocalStatus({ type: "error", message: e instanceof Error ? e.message : String(e) });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLocal(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Shared so a successful access grant can refresh the list too (dedup with the
  // mount effect). React 19 makes a late setState after unmount a safe no-op.
  const loadUsbPrinters = useCallback(async () => {
    try {
      const printers = await listUsbPrinters();
      setUsbPrinters(printers);
      setSelectedUsb((cur) => (cur && printers.some((p) => p.id === cur) ? cur : printers[0]?.id ?? ""));
    } catch (e) {
      setUsbStatus({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    if (!isDesktopShell) return;
    // loadUsbPrinters sets state asynchronously; the disable covers both the
    // function call (tracked by the plugin) and the finally callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUsbPrinters().finally(() => setLoadingUsb(false));
  }, [loadUsbPrinters]);

  // Unplugging the printer hides the USB tab button; correct the stranded tab
  // during render (React's derived-state pattern) so there is no empty-tab flash.
  if (tab === "usb" && usbPrinters.length === 0) setTab("network");

  function persistNetwork() {
    localStorage.setItem(LS_IP, ip);
    localStorage.setItem(LS_PORT, port);
  }

  async function handleNetworkSend() {
    const portNum = port.trim() === "" ? 9100 : Number(port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setNetStatus({ type: "error", message: t.zebraPrint.errorInvalidPort });
      return;
    }
    persistNetwork();
    setNetStatus({ type: "sending" });
    const result = await sendViaNetwork(ip.trim(), portNum, zpl);
    switch (result.kind) {
      case "sent":
        setNetStatus({ type: "success", message: t.zebraPrint.success });
        return;
      case "responded":
        // 2xx only counts as success; print servers / proxies that respond
        // with 4xx or 5xx must surface as an error rather than green-success.
        if (result.status >= 200 && result.status < 300) {
          setNetStatus({ type: "success", message: t.zebraPrint.success });
        } else {
          setNetStatus({ type: "error", message: t.zebraPrint.errorGeneric });
        }
        return;
      case "no_response":
        // Web raw-socket printers never reply over HTTP, so a timeout is the
        // typical success yet indistinguishable from an unreachable host.
        setNetStatus({ type: "success", message: t.zebraPrint.sentNoResponse });
        return;
      case "unreachable":
        setNetStatus({ type: "error", message: t.zebraPrint.errorNoResponse });
        return;
      case "refused":
        setNetStatus({ type: "error", message: t.zebraPrint.errorRefused });
        return;
      case "error":
        setNetStatus({ type: "error", message: t.zebraPrint.errorGeneric });
        return;
      default: {
        const _exhaustive: never = result;
        throw new Error(`unhandled print result: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  async function handleDiscover() {
    setDiscovering(true);
    setBpStatus({ type: "idle" });
    try {
      const found = await discoverBrowserPrintDevices();
      setDevices(found);
      const first = found[0];
      if (first && !found.find((d) => d.uid === selectedUid)) {
        setSelectedUid(first.uid);
        localStorage.setItem(LS_PRINTER_UID, first.uid);
      }
    } catch {
      setBpStatus({ type: "error", message: t.zebraPrint.agentNotFound });
    } finally {
      setDiscovering(false);
    }
  }

  async function handleBrowserPrintSend() {
    const device = devices.find((d) => d.uid === selectedUid);
    if (!device) return;
    setBpStatus({ type: "sending" });
    try {
      await sendViaBrowserPrint(device, zpl);
      setBpStatus({ type: "success", message: t.zebraPrint.success });
    } catch (e) {
      setBpStatus({
        type: "error",
        message: e instanceof Error ? e.message : t.zebraPrint.errorGeneric,
      });
    }
  }

  async function handleLocalSend() {
    if (!selectedLocal) return;
    localStorage.setItem(LS_LOCAL_PRINTER, selectedLocal);
    setLocalStatus({ type: "sending" });
    const result = await sendZplLocal(selectedLocal, zpl);
    if (result.kind === "sent") {
      setLocalStatus({ type: "success", message: t.zebraPrint.success });
    } else {
      setLocalStatus({ type: "error", message: result.message || t.zebraPrint.errorGeneric });
    }
  }

  async function handleUsbSend() {
    if (!selectedUsb) return;
    localStorage.setItem(LS_USB, selectedUsb);
    setUsbStatus({ type: "sending" });
    const result = await sendZplUsb(selectedUsb, zpl);
    switch (result.kind) {
      case "sent":
        setUsbNeedsSetup(false);
        setUsbStatus({ type: "success", message: t.zebraPrint.success });
        return;
      case "permission_denied":
        setUsbNeedsSetup(true);
        setUsbStatus({ type: "error", message: t.zebraPrint.usbPermissionDenied });
        return;
      case "not_found":
        setUsbNeedsSetup(false);
        setUsbStatus({ type: "error", message: t.zebraPrint.usbNotFound });
        return;
      case "error":
        setUsbNeedsSetup(false);
        setUsbStatus({ type: "error", message: result.message || t.zebraPrint.errorGeneric });
        return;
      default: {
        const _exhaustive: never = result;
        throw new Error(`unhandled print result: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  async function handleUsbSetup() {
    try {
      await setupUsbAccess();
      // Access granted: refresh (a hot-plugged printer may be new) and clear the prompt.
      await loadUsbPrinters();
      setUsbNeedsSetup(false);
      setUsbStatus({ type: "idle" });
    } catch (e) {
      // Failed or cancelled: keep usbNeedsSetup so the button stays available.
      setUsbStatus({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
      active
        ? "text-text border-b border-accent"
        : "text-muted hover:text-text"
    }`;

  return (
    <DialogShell
      onClose={onClose}
      labelledBy="zebra-print-title"
      boxClassName="bg-surface border border-border rounded shadow-lg flex flex-col w-[420px] max-w-[95vw]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <span id="zebra-print-title" className="font-mono text-[10px] text-muted uppercase tracking-widest">
          {t.zebraPrint.heading}
        </span>
        <button
          onClick={onClose}
          aria-label={t.app.close}
          className="p-1 rounded text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          <XMarkIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button className={tabClass(tab === "network")} onClick={() => setTab("network")}>
          {t.zebraPrint.tabNetwork}
        </button>
        <button
          className={tabClass(tab === "browserprint")}
          onClick={() => setTab("browserprint")}
        >
          {t.zebraPrint.tabBrowserPrint}
        </button>
        {isDesktopShell && (
          <button className={tabClass(tab === "local")} onClick={() => setTab("local")}>
            {t.zebraPrint.tabLocal}
          </button>
        )}
        {isDesktopShell && usbPrinters.length > 0 && (
          <button className={tabClass(tab === "usb")} onClick={() => setTab("usb")}>
            {t.zebraPrint.tabUsb}
          </button>
        )}
      </div>

      {/* Network tab */}
      {tab === "network" && (
        <div className="flex flex-col gap-3 p-4">
          {window.location.protocol === "https:" && (
            <p className="font-mono text-[10px] text-yellow-400">
              {t.zebraPrint.httpsWarning}
            </p>
          )}
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <label className="font-mono text-[10px] text-muted uppercase tracking-widest">
                {t.zebraPrint.ipAddress}
              </label>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                onBlur={persistNetwork}
                placeholder="192.168.1.100"
                className="bg-bg border border-border rounded px-2 py-1 text-xs font-mono text-text focus:outline-none focus:border-accent"
              />
            </div>
            <div className="w-20 flex flex-col gap-1">
              <label className="font-mono text-[10px] text-muted uppercase tracking-widest">
                {t.zebraPrint.port}
              </label>
              <input
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                onBlur={persistNetwork}
                className="bg-bg border border-border rounded px-2 py-1 text-xs font-mono text-text focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <button
            onClick={handleNetworkSend}
            disabled={!ip.trim() || netStatus.type === "sending"}
            className="self-end px-3 py-1.5 text-xs font-mono rounded bg-accent text-bg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {netStatus.type === "sending" ? t.zebraPrint.sending : t.zebraPrint.send}
          </button>

          <StatusMessage status={netStatus} />
        </div>
      )}

      {/* Browser Print tab */}
      {tab === "browserprint" && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <label className="font-mono text-[10px] text-muted uppercase tracking-widest">
                {t.zebraPrint.printer}
              </label>
              <Select<string>
                value={selectedUid}
                onChange={(uid) => {
                  setSelectedUid(uid);
                  localStorage.setItem(LS_PRINTER_UID, uid);
                }}
                disabled={devices.length === 0}
                groups={[
                  {
                    options:
                      devices.length === 0
                        ? [{ value: "", label: t.zebraPrint.noPrinters }]
                        : devices.map((d) => ({
                            value: d.uid,
                            label: d.name || d.manufacturer || d.uid,
                          })),
                  },
                ]}
              />
            </div>
            <button
              onClick={handleDiscover}
              disabled={discovering}
              className="px-3 py-1.5 text-xs font-mono rounded border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {discovering ? t.zebraPrint.discovering : t.zebraPrint.discover}
            </button>
          </div>

          <button
            onClick={handleBrowserPrintSend}
            disabled={!selectedUid || devices.length === 0 || bpStatus.type === "sending"}
            className="self-end px-3 py-1.5 text-xs font-mono rounded bg-accent text-bg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {bpStatus.type === "sending" ? t.zebraPrint.sending : t.zebraPrint.send}
          </button>

          <StatusMessage status={bpStatus} />
        </div>
      )}

      {/* Local printer tab (OS spooler, desktop shell only) */}
      {tab === "local" && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] text-muted uppercase tracking-widest">
              {t.zebraPrint.printer}
            </label>
            <Select<string>
              value={selectedLocal}
              onChange={(name) => {
                setSelectedLocal(name);
                localStorage.setItem(LS_LOCAL_PRINTER, name);
              }}
              disabled={localPrinters.length === 0}
              groups={[
                {
                  options:
                    localPrinters.length === 0
                      ? [
                          {
                            value: "",
                            label: loadingLocal ? t.zebraPrint.discovering : t.zebraPrint.noPrinters,
                          },
                        ]
                      : localPrinters.map((p) => ({
                          value: p.system_name,
                          label: isLikelyZebra(p) ? `${p.name} · ZPL?` : p.name,
                        })),
                },
              ]}
            />
          </div>
          <button
            onClick={handleLocalSend}
            disabled={
              !selectedLocal ||
              localPrinters.length === 0 ||
              loadingLocal ||
              localStatus.type === "sending"
            }
            className="self-end px-3 py-1.5 text-xs font-mono rounded bg-accent text-bg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {localStatus.type === "sending" ? t.zebraPrint.sending : t.zebraPrint.send}
          </button>
          <StatusMessage status={localStatus} />
        </div>
      )}

      {/* USB direct tab (Linux desktop only, shown only when devices found) */}
      {tab === "usb" && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] text-muted uppercase tracking-widest">
              {t.zebraPrint.printer}
            </label>
            <Select<string>
              value={selectedUsb}
              onChange={(id) => {
                setSelectedUsb(id);
                localStorage.setItem(LS_USB, id);
              }}
              disabled={usbPrinters.length === 0}
              groups={[
                {
                  options:
                    usbPrinters.length === 0
                      ? [{ value: "", label: loadingUsb ? t.zebraPrint.discovering : t.zebraPrint.noPrinters }]
                      : usbPrinters.map((p) => ({
                          value: p.id,
                          label: isUsbZebra(p) ? `${p.name} · ZPL?` : p.name,
                        })),
                },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            {usbNeedsSetup ? (
              <button
                onClick={handleUsbSetup}
                className="px-3 py-1.5 text-xs font-mono rounded border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                {t.zebraPrint.usbSetupAccess}
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={handleUsbSend}
              disabled={!selectedUsb || usbPrinters.length === 0 || loadingUsb || usbStatus.type === "sending"}
              className="px-3 py-1.5 text-xs font-mono rounded bg-accent text-bg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {usbStatus.type === "sending" ? t.zebraPrint.sending : t.zebraPrint.send}
            </button>
          </div>
          <StatusMessage status={usbStatus} />
        </div>
      )}
    </DialogShell>
  );
}
