import { isDesktopShell } from "./platform";

/** Mirrors the Rust McpStatus DTO. `available` is the build capability: false
 *  in a release shipped without the bundled sidecar. */
export interface McpStatus {
  running: boolean;
  available: boolean;
}

/** 32 hex chars (16 random bytes) for the loopback server's bearer token. */
export function generateMcpToken(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Claude-Desktop style config for the loopback Streamable HTTP server. The
 *  server serves the transport on any path, so the tested root `/` is the URL;
 *  every request must carry the bearer token. */
export function mcpConfigSnippet(port: number, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        zplab: {
          url: `http://127.0.0.1:${port}/`,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

export async function startMcpServer(opts: { port: number; token: string }): Promise<void> {
  if (!isDesktopShell) throw new Error("The MCP server requires the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("mcp_start", { port: opts.port, token: opts.token });
}

export async function stopMcpServer(): Promise<void> {
  if (!isDesktopShell) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("mcp_stop");
}

export async function mcpServerStatus(): Promise<McpStatus> {
  if (!isDesktopShell) return { running: false, available: false };
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<McpStatus>("mcp_status");
}
