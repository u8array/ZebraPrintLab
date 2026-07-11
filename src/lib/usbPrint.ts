import { isDesktopShell } from "./platform";
import { errorMessage } from "./errorMessage";

/** Mirrors the Rust UsbPrinter DTO (one usblp device). */
export interface UsbPrinter {
  id: string;
  name: string;
  vendor_id: string;
}

export type UsbPrintResult =
  | { kind: "sent" }
  | { kind: "permission_denied" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

/** Hint only for sorting/labels: the Zebra USB vendor id. */
export function isLikelyZebra(p: UsbPrinter): boolean {
  return p.vendor_id.toLowerCase() === "0a5f";
}

/** Desktop shell only; the web build and non-Linux desktops return nothing. */
export async function listUsbPrinters(): Promise<UsbPrinter[]> {
  if (!isDesktopShell) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<UsbPrinter[]>("list_usb_printers");
}

export async function sendZplUsb(id: string, zpl: string): Promise<UsbPrintResult> {
  if (!isDesktopShell) return { kind: "error", message: "USB printing requires the desktop app" };
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<UsbPrintResult>("send_zpl_usb", { device: id, zpl });
  } catch (e) {
    return { kind: "error", message: errorMessage(e) };
  }
}

export async function setupUsbAccess(): Promise<void> {
  if (!isDesktopShell) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("setup_usb_access");
}
