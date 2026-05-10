import { describe, it, expect, vi } from "vitest";
import {
  hydrateLocalStoragePrefix,
  safeLocalStorageSet,
} from "./localStorageBucket";

// The vitest setup's localStorage shim retains keys after `clear()` (sets to
// undefined), so cross-test ghost keys would leak into hydration. Each test
// uses a unique prefix instead of relying on `clear`.

describe("hydrateLocalStoragePrefix", () => {
  it("forwards parsed entries that match the prefix", () => {
    localStorage.setItem("hyd-a-1", JSON.stringify({ id: "1" }));
    localStorage.setItem("hyd-a-2", JSON.stringify({ id: "2" }));
    localStorage.setItem("other-x", JSON.stringify({ id: "x" }));

    const seen: { id: string }[] = [];
    hydrateLocalStoragePrefix<{ id: string }>("hyd-a-", (e) => seen.push(e));

    expect(seen.map((e) => e.id).sort()).toEqual(["1", "2"]);
  });

  it("silently drops corrupt JSON", () => {
    localStorage.setItem("hyd-b-good", JSON.stringify({ id: "good" }));
    localStorage.setItem("hyd-b-bad", "{not-json");

    const seen: { id: string }[] = [];
    hydrateLocalStoragePrefix<{ id: string }>("hyd-b-", (e) => seen.push(e));

    expect(seen).toEqual([{ id: "good" }]);
  });

  it("drops non-object primitives (number, bool, null, array)", () => {
    localStorage.setItem("hyd-c-num", "42");
    localStorage.setItem("hyd-c-bool", "true");
    localStorage.setItem("hyd-c-null", "null");
    localStorage.setItem("hyd-c-arr", "[1,2]");
    localStorage.setItem("hyd-c-obj", JSON.stringify({ id: "ok" }));

    const seen: { id: string }[] = [];
    hydrateLocalStoragePrefix<{ id: string }>("hyd-c-", (e) => seen.push(e));

    expect(seen).toEqual([{ id: "ok" }]);
  });

  it("snapshots keys so an accept callback can mutate localStorage", () => {
    localStorage.setItem("hyd-d-1", JSON.stringify({ id: "1" }));
    localStorage.setItem("hyd-d-2", JSON.stringify({ id: "2" }));
    localStorage.setItem("hyd-d-3", JSON.stringify({ id: "3" }));

    const seen: string[] = [];
    hydrateLocalStoragePrefix<{ id: string }>("hyd-d-", (e) => {
      seen.push(e.id);
      // Mutating the store mid-iteration must not cause us to skip entries.
      localStorage.removeItem(`hyd-d-${e.id}`);
    });

    expect(seen.sort()).toEqual(["1", "2", "3"]);
  });
});

describe("safeLocalStorageSet", () => {
  it("writes the value when storage accepts it", () => {
    safeLocalStorageSet("sls-write-key", "v");
    expect(localStorage.getItem("sls-write-key")).toBe("v");
  });

  it("swallows quota errors", () => {
    const spy = vi
      .spyOn(localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    try {
      expect(() => safeLocalStorageSet("sls-quota-key", "v")).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
