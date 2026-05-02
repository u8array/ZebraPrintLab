import { useEffect, useRef, useState } from "react";
import { XMarkIcon } from "@heroicons/react/16/solid";
import { useT } from "../../lib/useT";
import {
  discoverBrowserPrintDevices,
  sendViaBrowserPrint,
  sendViaNetwork,
  type BrowserPrintDevice,
} from "../../lib/zebraPrint";

const LS_IP = "zebra_print_ip";
const LS_PORT = "zebra_print_port";
const LS_PRINTER_UID = "zebra_print_uid";

type Tab = "network" | "browserprint";
type Status = { type: "idle" | "sending" | "success" | "error"; message?: string };

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

  const ipRef = useRef(ip);
  const portRef = useRef(port);
  ipRef.current = ip;
  portRef.current = port;

  useEffect(() => {
    localStorage.setItem(LS_IP, ip);
  }, [ip]);
  useEffect(() => {
    localStorage.setItem(LS_PORT, port);
  }, [port]);
  useEffect(() => {
    if (selectedUid) localStorage.setItem(LS_PRINTER_UID, selectedUid);
  }, [selectedUid]);

  async function handleNetworkSend() {
    setNetStatus({ type: "sending" });
    try {
      await sendViaNetwork(ip.trim(), Number(port) || 9100, zpl);
      setNetStatus({ type: "success", message: t.zebraPrint.success });
    } catch (e) {
      const msg =
        e instanceof TypeError && /refused/i.test(e.message)
          ? t.zebraPrint.errorRefused
          : t.zebraPrint.errorGeneric;
      setNetStatus({ type: "error", message: msg });
    }
  }

  async function handleDiscover() {
    setDiscovering(true);
    setBpStatus({ type: "idle" });
    try {
      const found = await discoverBrowserPrintDevices();
      setDevices(found);
      if (found.length > 0 && !found.find((d) => d.uid === selectedUid)) {
        setSelectedUid(found[0].uid);
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

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
      active
        ? "text-text border-b border-accent"
        : "text-muted hover:text-text"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded shadow-lg flex flex-col w-[420px] max-w-[95vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
          <span className="font-mono text-[10px] text-muted uppercase tracking-widest">
            {t.zebraPrint.heading}
          </span>
          <button
            onClick={onClose}
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
        </div>

        {/* Network tab */}
        {tab === "network" && (
          <div className="flex flex-col gap-3 p-4">
            <div className="flex gap-2">
              <div className="flex-1 flex flex-col gap-1">
                <label className="font-mono text-[10px] text-muted uppercase tracking-widest">
                  {t.zebraPrint.ipAddress}
                </label>
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
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
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
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

            {netStatus.type !== "idle" && netStatus.type !== "sending" && (
              <p
                className={`font-mono text-[10px] ${
                  netStatus.type === "success" ? "text-green-400" : "text-red-400"
                }`}
              >
                {netStatus.message}
              </p>
            )}
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
                <select
                  value={selectedUid}
                  onChange={(e) => setSelectedUid(e.target.value)}
                  disabled={devices.length === 0}
                  className="bg-bg border border-border rounded px-2 py-1 text-xs font-mono text-text focus:outline-none focus:border-accent disabled:opacity-50"
                >
                  {devices.length === 0 && (
                    <option value="">{t.zebraPrint.noPrinters}</option>
                  )}
                  {devices.map((d) => (
                    <option key={d.uid} value={d.uid}>
                      {d.name || d.manufacturer || d.uid}
                    </option>
                  ))}
                </select>
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

            {bpStatus.type !== "idle" && bpStatus.type !== "sending" && (
              <p
                className={`font-mono text-[10px] ${
                  bpStatus.type === "success" ? "text-green-400" : "text-red-400"
                }`}
              >
                {bpStatus.message}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
