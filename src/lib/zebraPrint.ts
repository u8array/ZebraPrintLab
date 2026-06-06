const BROWSER_PRINT_HTTP = "http://localhost:9100";
const BROWSER_PRINT_HTTPS = "https://localhost:9101";

export interface BrowserPrintDevice {
  uid: string;
  connection: string;
  device_type: string;
  manufacturer: string;
  name: string;
  version: number;
}

async function bpFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BROWSER_PRINT_HTTP}${path}`, init);
  } catch {
    return fetch(`${BROWSER_PRINT_HTTPS}${path}`, init);
  }
}

export async function discoverBrowserPrintDevices(): Promise<BrowserPrintDevice[]> {
  const res = await bpFetch("/available");
  if (!res.ok) throw new Error(`Agent returned ${res.status}`);
  const data: unknown = await res.json();
  const devices = Array.isArray(data)
    ? data
    : (data as Record<string, unknown> | null)?.printer;
  if (!Array.isArray(devices)) return [];
  return devices as BrowserPrintDevice[];
}

export async function sendViaBrowserPrint(
  device: BrowserPrintDevice,
  zpl: string,
): Promise<void> {
  const res = await bpFetch("/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device, data: zpl }),
  });
  if (!res.ok) throw new Error(`Agent write failed: ${res.status}`);
}

export function isConnectionRefused(e: unknown): boolean {
  return e instanceof TypeError && /refused/i.test(e.message);
}

/** no_response = timeout (raw-socket success OR unreachable; browser
 *  cannot distinguish); refused = TCP RST; responded = HTTP came back. */
export type NetworkPrintResult =
  | { kind: "responded"; status: number }
  | { kind: "no_response" }
  | { kind: "refused" };

/** Returns Result because raw-socket success and unreachable raise the same exception. */
export async function sendViaNetwork(
  ip: string,
  port: number,
  zpl: string,
): Promise<NetworkPrintResult> {
  try {
    const res = await fetch(`http://${ip}:${port}`, {
      method: "POST",
      body: zpl,
      headers: { "Content-Type": "text/plain" },
      signal: AbortSignal.timeout(4000),
    });
    return { kind: "responded", status: res.status };
  } catch (e) {
    if (isConnectionRefused(e)) return { kind: "refused" };
    return { kind: "no_response" };
  }
}
