import { useState, useEffect, useCallback, type ReactNode } from "react";
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
import { getPrinterAddress, setPrinterAddress } from "../../lib/printerAddress";
import { listLocalPrinters, sendZplLocal, isLikelyZebra, type LocalPrinter } from "../../lib/localPrint";
import { listUsbPrinters, sendZplUsb, setupUsbAccess, isLikelyZebra as isUsbZebra, type UsbPrinter } from "../../lib/usbPrint";

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

// The list-based transports (browser print, OS spooler, direct USB) share this
// body; network keeps its own ip/port form and stays separate.
interface TransportView {
  key: Tab;
  selected: string;
  onSelect: (value: string) => void;
  options: { value: string; label: string }[];
  selectDisabled: boolean;
  onSend: () => void;
  sendLabel: string;
  sendDisabled: boolean;
  status: Status;
  extra?: ReactNode;
}

function TransportBody({ view, fieldLabel }: { view: TransportView; fieldLabel: string }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] text-muted uppercase tracking-widest">{fieldLabel}</label>
        <Select<string>
          value={view.selected}
          onChange={view.onSelect}
          disabled={view.selectDisabled}
          groups={[{ options: view.options }]}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        {view.extra ?? <span />}
        <button
          onClick={view.onSend}
          disabled={view.sendDisabled}
          className="px-3 py-1.5 text-xs font-mono rounded bg-accent text-bg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {view.sendLabel}
        </button>
      </div>
      <StatusMessage status={view.status} />
    </div>
  );
}

interface Props {
  zpl: string;
  onClose: () => void;
}

export function PrintToZebraDialog({ zpl, onClose }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("network");

  // Network tab state; the address is shared with the preview provider.
  const [ip, setIp] = useState(() => getPrinterAddress().host);
  const [port, setPort] = useState(() => String(getPrinterAddress().port));
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
    setPrinterAddress(ip, port);
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

  const tabs: { key: Tab; label: string; enabled: boolean }[] = [
    { key: "network", label: t.zebraPrint.tabNetwork, enabled: true },
    { key: "browserprint", label: t.zebraPrint.tabBrowserPrint, enabled: !isDesktopShell },
    { key: "local", label: t.zebraPrint.tabLocal, enabled: isDesktopShell },
    { key: "usb", label: t.zebraPrint.tabUsb, enabled: isDesktopShell && usbPrinters.length > 0 },
  ];

  const views: TransportView[] = [
    {
      key: "browserprint",
      selected: selectedUid,
      onSelect: (uid) => {
        setSelectedUid(uid);
        localStorage.setItem(LS_PRINTER_UID, uid);
      },
      options:
        devices.length === 0
          ? [{ value: "", label: t.zebraPrint.noPrinters }]
          : devices.map((d) => ({ value: d.uid, label: d.name || d.manufacturer || d.uid })),
      selectDisabled: devices.length === 0,
      onSend: handleBrowserPrintSend,
      sendLabel: bpStatus.type === "sending" ? t.zebraPrint.sending : t.zebraPrint.send,
      sendDisabled: !selectedUid || devices.length === 0 || bpStatus.type === "sending",
      status: bpStatus,
      extra: (
        <button
          onClick={handleDiscover}
          disabled={discovering}
          className="px-3 py-1.5 text-xs font-mono rounded border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {discovering ? t.zebraPrint.discovering : t.zebraPrint.discover}
        </button>
      ),
    },
    {
      key: "local",
      selected: selectedLocal,
      onSelect: (name) => {
        setSelectedLocal(name);
        localStorage.setItem(LS_LOCAL_PRINTER, name);
      },
      options:
        localPrinters.length === 0
          ? [{ value: "", label: loadingLocal ? t.zebraPrint.discovering : t.zebraPrint.noPrinters }]
          : localPrinters.map((p) => ({
              value: p.system_name,
              label: isLikelyZebra(p) ? `${p.name} · ZPL?` : p.name,
            })),
      selectDisabled: localPrinters.length === 0,
      onSend: handleLocalSend,
      sendLabel: localStatus.type === "sending" ? t.zebraPrint.sending : t.zebraPrint.send,
      sendDisabled:
        !selectedLocal || localPrinters.length === 0 || loadingLocal || localStatus.type === "sending",
      status: localStatus,
    },
    {
      key: "usb",
      selected: selectedUsb,
      onSelect: (id) => {
        setSelectedUsb(id);
        localStorage.setItem(LS_USB, id);
      },
      options:
        usbPrinters.length === 0
          ? [{ value: "", label: loadingUsb ? t.zebraPrint.discovering : t.zebraPrint.noPrinters }]
          : usbPrinters.map((p) => ({
              value: p.id,
              label: isUsbZebra(p) ? `${p.name} · ZPL?` : p.name,
            })),
      selectDisabled: usbPrinters.length === 0,
      onSend: handleUsbSend,
      sendLabel: usbStatus.type === "sending" ? t.zebraPrint.sending : t.zebraPrint.send,
      sendDisabled: !selectedUsb || usbPrinters.length === 0 || loadingUsb || usbStatus.type === "sending",
      status: usbStatus,
      extra: usbNeedsSetup ? (
        <button
          onClick={handleUsbSetup}
          className="px-3 py-1.5 text-xs font-mono rounded border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          {t.zebraPrint.usbSetupAccess}
        </button>
      ) : undefined,
    },
  ];
  const activeView = views.find((v) => v.key === tab);

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
        {tabs
          .filter((tb) => tb.enabled)
          .map((tb) => (
            <button key={tb.key} className={tabClass(tab === tb.key)} onClick={() => setTab(tb.key)}>
              {tb.label}
            </button>
          ))}
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

      {/* List-based transports (browser print, OS spooler, direct USB) */}
      {activeView && <TransportBody view={activeView} fieldLabel={t.zebraPrint.printer} />}
    </DialogShell>
  );
}
