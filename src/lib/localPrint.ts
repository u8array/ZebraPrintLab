import { isDesktopShell } from "./platform";

/** Mirrors the Rust LocalPrinter DTO (one OS print queue). */
export interface LocalPrinter {
  system_name: string;
  name: string;
  driver_name: string;
  port_name: string;
}

export type LocalPrintResult = { kind: "sent" } | { kind: "error"; message: string };

/** Hint only (sorting/labels), never filtering: a ZDesigner/ZPL driver or a USB
 *  port strongly suggests a raw-ZPL-capable queue. */
export function isLikelyZebra(p: LocalPrinter): boolean {
  const d = p.driver_name.toLowerCase();
  return d.includes("zdesigner") || d.includes("zpl") || d.includes("zebra") || p.port_name.toUpperCase().startsWith("USB");
}

/** Desktop shell only: enumerates OS print queues via the Rust command; the web
 *  build has no spooler access, so it returns nothing. */
export async function listLocalPrinters(): Promise<LocalPrinter[]> {
  if (!isDesktopShell) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  const printers = await invoke<LocalPrinter[]>("list_printers");
  // Likely-Zebra first, then by name (no OS-default: an office printer is a
  // worse pick than the label printer for this app).
  return [...printers].sort(
    (a, b) => Number(isLikelyZebra(b)) - Number(isLikelyZebra(a)) || a.name.localeCompare(b.name),
  );
}

export async function sendZplLocal(systemName: string, zpl: string): Promise<LocalPrintResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    await invoke("send_zpl_local", { printer: systemName, zpl });
    return { kind: "sent" };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
