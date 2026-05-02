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
  const devices = Array.isArray(data) ? data : (data as Record<string, unknown>).printer;
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

// Zebra network printers accept raw ZPL on port 9100.
// The printer ignores HTTP headers and processes ZPL from the body.
// Chrome shows a Private Network Access prompt when connecting to LAN devices.
export async function sendViaNetwork(
  ip: string,
  port: number,
  zpl: string,
): Promise<void> {
  try {
    await fetch(`http://${ip}:${port}`, {
      method: "POST",
      body: zpl,
      headers: { "Content-Type": "text/plain" },
      // Short timeout — printer won't send a valid HTTP response
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    // Printers don't send valid HTTP responses, so a network/abort error is expected.
    // Re-throw only if the connection was outright refused (ECONNREFUSED / ERR_CONNECTION_REFUSED).
    if (e instanceof TypeError && /refused/i.test((e as TypeError).message)) {
      throw e;
    }
  }
}
