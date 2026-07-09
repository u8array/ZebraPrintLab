/** Network printer address, shared by the print dialog and the printer-side
 *  preview provider. localStorage (not the store) so the address follows the
 *  browser profile like the other zebra_print_* device bindings. */

const LS_IP = "zebra_print_ip";
const LS_PORT = "zebra_print_port";

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
