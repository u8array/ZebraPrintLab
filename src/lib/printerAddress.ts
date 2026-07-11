/** Printer device bindings shared by the print dialog and the printer-side
 *  preview provider: network address, last USB printer, and which of the two
 *  the preview uses. localStorage (not the store) so they follow the browser
 *  profile like the other zebra_print_* device bindings. */

const LS_IP = "zebra_print_ip";
const LS_PORT = "zebra_print_port";
const LS_USB = "zebra_print_usb";
const LS_PREVIEW_TRANSPORT = "zebra_preview_transport";

export interface PrinterAddress {
  host: string;
  port: number;
}

export function getPrinterAddress(): PrinterAddress {
  const host = (localStorage.getItem(LS_IP) ?? "").trim();
  const port = Number.parseInt(localStorage.getItem(LS_PORT) ?? "", 10);
  return { host, port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 9100 };
}

export function setPrinterAddress(host: string, port: string | number): void {
  localStorage.setItem(LS_IP, String(host));
  localStorage.setItem(LS_PORT, String(port));
}

export function getUsbPrinterId(): string {
  return localStorage.getItem(LS_USB) ?? "";
}

export function setUsbPrinterId(id: string): void {
  localStorage.setItem(LS_USB, id);
}

export type PreviewTransport = "network" | "usb";

export function getPreviewTransport(): PreviewTransport {
  return localStorage.getItem(LS_PREVIEW_TRANSPORT) === "usb" ? "usb" : "network";
}

export function setPreviewTransport(transport: PreviewTransport): void {
  localStorage.setItem(LS_PREVIEW_TRANSPORT, transport);
}
