// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { getCredential, setCredential } from "./credentialStore";

/** Web backend only: jsdom is not a Tauri shell, so the seam routes to
 *  localStorage. The desktop keyring path is covered by the Rust commands. */

beforeEach(() => {
  localStorage.clear();
});

describe("credentialStore (web backend)", () => {
  it("returns null for an absent credential", async () => {
    expect(await getCredential("labelary-api-key")).toBeNull();
  });

  it("stores and reads back a value, trimmed", async () => {
    await setCredential("labelary-api-key", "  abc  ");
    expect(await getCredential("labelary-api-key")).toBe("abc");
    expect(localStorage.getItem("zpl-cred-labelary-api-key")).toBe("abc");
  });

  it("an empty or whitespace value deletes the credential", async () => {
    await setCredential("labelary-api-key", "abc");
    await setCredential("labelary-api-key", "   ");
    expect(await getCredential("labelary-api-key")).toBeNull();
    expect(localStorage.getItem("zpl-cred-labelary-api-key")).toBeNull();
  });
});
