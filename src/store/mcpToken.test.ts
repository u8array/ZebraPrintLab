import { describe, it, expect, beforeEach, vi } from "vitest";

const getCredential = vi.fn<(name: string) => Promise<string | null>>();
const setCredential = vi.fn<(name: string, value: string) => Promise<void>>();
// Mock one level deeper (the Tauri invoke seam) so the real credentialStore
// module, including makeCredentialHydrator, runs in the test.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args: { name: string; value?: string }) => {
    if (cmd === "credential_get") return getCredential(args.name);
    if (cmd === "credential_set") return setCredential(args.name, args.value ?? "");
    if (cmd === "credential_delete") return setCredential(args.name, "");
    return Promise.reject(new Error(`unmocked command: ${cmd}`));
  },
}));
vi.mock("../lib/platform", () => ({ isDesktopShell: true }));

import { useLabelStore } from "./labelStore";

const FALLBACK_LS = "zpl-mcp-token-fallback";
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  getCredential.mockReset();
  setCredential.mockReset();
  setCredential.mockResolvedValue();
  localStorage.removeItem(FALLBACK_LS);
  useLabelStore.setState({ mcpServerToken: "", mcpServerTokenLoaded: false });
});

describe("mcp token hydration", () => {
  it("loads the keychain token and clears a stale fallback slot", async () => {
    localStorage.setItem(FALLBACK_LS, "stale");
    getCredential.mockResolvedValue("kc-token");
    await useLabelStore.getState().hydrateMcpToken();
    expect(useLabelStore.getState().mcpServerToken).toBe("kc-token");
    expect(useLabelStore.getState().mcpServerTokenLoaded).toBe(true);
    expect(localStorage.getItem(FALLBACK_LS)).toBeNull();
  });

  it("migrates a pre-keychain localStorage-persisted token into the keychain", async () => {
    useLabelStore.setState({ mcpServerToken: "legacy-token" });
    getCredential.mockResolvedValue(null);
    await useLabelStore.getState().hydrateMcpToken();
    expect(useLabelStore.getState().mcpServerToken).toBe("legacy-token");
    expect(setCredential).toHaveBeenCalledWith("mcp-server-token", "legacy-token");
  });

  it("uses the fallback slot when the credential store is unreadable", async () => {
    localStorage.setItem(FALLBACK_LS, "fb-token");
    getCredential.mockRejectedValue(new Error("no daemon"));
    await useLabelStore.getState().hydrateMcpToken();
    expect(useLabelStore.getState().mcpServerToken).toBe("fb-token");
    expect(useLabelStore.getState().mcpServerTokenLoaded).toBe(true);
  });

  it("stays unloaded on a read failure without a fallback (transient keychain error retries)", async () => {
    getCredential.mockRejectedValueOnce(new Error("no daemon"));
    await useLabelStore.getState().hydrateMcpToken();
    expect(useLabelStore.getState().mcpServerTokenLoaded).toBe(false);
  });

  it("keeps a newly generated token in the fallback slot when the keychain write fails", async () => {
    setCredential.mockRejectedValue(new Error("no daemon"));
    getCredential.mockResolvedValue(null);
    const token = await useLabelStore.getState().ensureMcpToken();
    expect(token).not.toBe("");
    await flush();
    expect(localStorage.getItem(FALLBACK_LS)).toBe(token);
  });

  it("ensureMcpToken adopts a stored token instead of racing a fresh one over it", async () => {
    // Slow keychain: enabling before the hydrate resolves must still end up
    // with the STORED token (a fresh one would break the wired-up config).
    let release: (v: string) => void = () => undefined;
    getCredential.mockReturnValue(new Promise((r) => (release = r)));
    const pending = useLabelStore.getState().ensureMcpToken();
    release("kc-token");
    expect(await pending).toBe("kc-token");
    expect(useLabelStore.getState().mcpServerToken).toBe("kc-token");
    expect(setCredential).not.toHaveBeenCalled();
  });

  it("ensureMcpToken refuses to generate after a failed read (empty is not KNOWN empty)", async () => {
    getCredential.mockRejectedValueOnce(new Error("transient"));
    await expect(useLabelStore.getState().ensureMcpToken()).rejects.toThrow(
      "credential store unavailable",
    );
    expect(setCredential).not.toHaveBeenCalled();
  });

  it("ensureMcpToken generates only when the store is KNOWN empty", async () => {
    getCredential.mockResolvedValue(null);
    const token = await useLabelStore.getState().ensureMcpToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(setCredential).toHaveBeenCalledWith("mcp-server-token", token);
  });
});
