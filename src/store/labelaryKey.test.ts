import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

// Pretend we're the desktop shell so a persisted 'printer' provider stays
// 'printer' (the web build degrades it to labelary), exercising the guard that
// a Labelary endpoint change must not tear down a printer render.
vi.mock("../lib/platform", () => ({ isDesktopShell: true }));

import { useLabelStore } from "./labelStore";

beforeEach(() => {
  getCredential.mockReset();
  setCredential.mockReset();
  setCredential.mockResolvedValue();
  useLabelStore.setState({
    labelaryApiKey: "",
    labelaryApiKeyLoaded: false,
    labelaryHost: "",
    previewMode: { status: "idle" },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("labelary key hydration", () => {
  it("loads the stored key into the store once", async () => {
    getCredential.mockResolvedValue("stored-key");
    await useLabelStore.getState().hydrateLabelaryApiKey();
    expect(useLabelStore.getState().labelaryApiKey).toBe("stored-key");
    expect(useLabelStore.getState().labelaryApiKeyLoaded).toBe(true);
  });

  it("treats an absent credential as an empty key", async () => {
    getCredential.mockResolvedValue(null);
    await useLabelStore.getState().hydrateLabelaryApiKey();
    expect(useLabelStore.getState().labelaryApiKey).toBe("");
    expect(useLabelStore.getState().labelaryApiKeyLoaded).toBe(true);
  });

  it("stays unloaded on a read failure so a later open retries", async () => {
    getCredential.mockRejectedValueOnce(new Error("no daemon"));
    await useLabelStore.getState().hydrateLabelaryApiKey();
    expect(useLabelStore.getState().labelaryApiKeyLoaded).toBe(false);
    getCredential.mockResolvedValue("recovered");
    await useLabelStore.getState().hydrateLabelaryApiKey();
    expect(useLabelStore.getState().labelaryApiKey).toBe("recovered");
  });

  it("skips the read once loaded (no redundant IPC)", async () => {
    getCredential.mockResolvedValue("k");
    await useLabelStore.getState().hydrateLabelaryApiKey();
    await useLabelStore.getState().hydrateLabelaryApiKey();
    expect(getCredential).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent hydrations into a single read", async () => {
    let resolveRead!: (v: string | null) => void;
    getCredential.mockReturnValue(new Promise((r) => { resolveRead = r; }));
    const a = useLabelStore.getState().hydrateLabelaryApiKey();
    const b = useLabelStore.getState().hydrateLabelaryApiKey();
    resolveRead("k");
    await Promise.all([a, b]);
    expect(getCredential).toHaveBeenCalledTimes(1);
    expect(useLabelStore.getState().labelaryApiKey).toBe("k");
  });

  it("trims a stored value with surrounding whitespace", async () => {
    getCredential.mockResolvedValue("  spaced  ");
    await useLabelStore.getState().hydrateLabelaryApiKey();
    expect(useLabelStore.getState().labelaryApiKey).toBe("spaced");
  });
});

describe("labelary endpoint change tears down a live preview", () => {
  it("saving a key exits an active preview", async () => {
    useLabelStore.setState({ previewMode: { status: "active", url: "blob:x" } });
    await useLabelStore.getState().saveLabelaryApiKey("k");
    expect(useLabelStore.getState().previewMode.status).toBe("idle");
  });

  it("changing the host exits an active preview", () => {
    useLabelStore.setState({ previewMode: { status: "active", url: "blob:x" }, labelaryHost: "" });
    useLabelStore.getState().setLabelaryHost("https://onprem.example.com");
    expect(useLabelStore.getState().previewMode.status).toBe("idle");
  });

  it("a no-op host blur leaves the preview alone", () => {
    useLabelStore.setState({ previewMode: { status: "active", url: "blob:x" }, labelaryHost: "https://h" });
    useLabelStore.getState().setLabelaryHost("https://h");
    expect(useLabelStore.getState().previewMode.status).toBe("active");
  });

  it("keeps a printer preview when the labelary endpoint changes", async () => {
    useLabelStore.setState({
      previewProvider: "printer",
      previewMode: { status: "active", url: "blob:x" },
    });
    await useLabelStore.getState().saveLabelaryApiKey("k");
    useLabelStore.getState().setLabelaryHost("https://onprem.example.com");
    expect(useLabelStore.getState().previewMode.status).toBe("active");
  });
});

describe("labelary key save", () => {
  it("persists to the credential store and mirrors in memory, trimmed", async () => {
    await useLabelStore.getState().saveLabelaryApiKey("  abc  ");
    expect(setCredential).toHaveBeenCalledWith("labelary-api-key", "abc");
    expect(useLabelStore.getState().labelaryApiKey).toBe("abc");
    expect(useLabelStore.getState().labelaryApiKeyLoaded).toBe(true);
  });

  it("propagates a credential-store failure without touching the cache", async () => {
    setCredential.mockRejectedValueOnce(new Error("locked"));
    await expect(useLabelStore.getState().saveLabelaryApiKey("abc")).rejects.toThrow("locked");
    expect(useLabelStore.getState().labelaryApiKey).toBe("");
  });

  it("a save during an in-flight hydrate is not clobbered by the late read", async () => {
    let resolveRead!: (v: string | null) => void;
    getCredential.mockReturnValue(new Promise((r) => { resolveRead = r; }));
    // Start hydrate (read pending), then save before it resolves.
    const hydrating = useLabelStore.getState().hydrateLabelaryApiKey();
    await useLabelStore.getState().saveLabelaryApiKey("newkey");
    expect(useLabelStore.getState().labelaryApiKey).toBe("newkey");
    // The stale read now resolves; it must not overwrite the saved key.
    resolveRead("oldkey");
    await hydrating;
    expect(useLabelStore.getState().labelaryApiKey).toBe("newkey");
  });
});
