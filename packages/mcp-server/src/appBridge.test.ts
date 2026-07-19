import { describe, it, expect, vi, afterEach } from "vitest";
import {
  APP_RESPONSE_TIMEOUT_MS,
  requestCurrentDesign,
  resolveDesignResponse,
} from "./appBridge";
import { designFile } from "./testFixtures";

function spyStdout(): { writes: string[]; restore: () => void } {
  const writes: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });
  return { writes, restore: () => spy.mockRestore() };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("appBridge", () => {
  it("writes a designRequest line and resolves with the app's reply", async () => {
    const { writes, restore } = spyStdout();
    try {
      const pending = requestCurrentDesign();
      expect(writes).toHaveLength(1);
      const event = JSON.parse(writes[0] ?? "{}") as { zplabEvent: string; id: number };
      expect(event.zplabEvent).toBe("designRequest");

      const delivered = resolveDesignResponse({ id: event.id, designFile });
      expect(delivered).toBe(true);
      const response = await pending;
      expect(response?.designFile).toEqual(designFile);
    } finally {
      restore();
    }
  });

  it("rejects an unknown id and a malformed payload", () => {
    expect(resolveDesignResponse({ id: 999999, designFile })).toBe(false);
    expect(resolveDesignResponse({ designFile })).toBe(false);
    expect(resolveDesignResponse("garbage")).toBe(false);
  });

  it("resolves null on timeout and ignores the late reply", async () => {
    vi.useFakeTimers();
    const { writes, restore } = spyStdout();
    try {
      const pending = requestCurrentDesign();
      const event = JSON.parse(writes[0] ?? "{}") as { id: number };
      vi.advanceTimersByTime(APP_RESPONSE_TIMEOUT_MS + 1);
      expect(await pending).toBeNull();
      expect(resolveDesignResponse({ id: event.id, designFile })).toBe(false);
    } finally {
      restore();
    }
  });
});
