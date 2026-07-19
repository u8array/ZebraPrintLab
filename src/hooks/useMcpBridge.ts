import { useEffect } from "react";
import { serializeDesign } from "@zplab/core/lib/designFile";
import { exportableLeaves } from "@zplab/core/types/Group";
import {
  measuredBoundsMap,
  subscribeMeasuredBounds,
} from "../components/Canvas/measuredBoundsCache";
import { postDesignResponse } from "../lib/mcpServer";
import { isDesktopShell } from "../lib/platform";
import { useLabelStore } from "../store/labelStore";

/** Re-measuring after an open_in_app swap is async (React commit + bwip),
 *  so an immediate snapshot could serve the OLD design's footprints. */
const MEASURE_QUIESCE_MS = 150;
const MEASURE_SETTLE_CAP_MS = 1000;

// Frame-less environments (tests, headless) have nothing to wait a frame for.
const nextFrame = (fn: () => void): void => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => fn());
  else setTimeout(fn, 0);
};

/** Resolve once the canvas has re-measured: two frames for the React commit,
 *  then no cache change for MEASURE_QUIESCE_MS (capped). */
function measuredSettled(): Promise<void> {
  return new Promise((resolve) => {
    let quiesce: ReturnType<typeof setTimeout>;
    let unsubscribe: () => void = () => undefined;
    const done = () => {
      clearTimeout(quiesce);
      clearTimeout(cap);
      unsubscribe();
      resolve();
    };
    const cap = setTimeout(done, MEASURE_SETTLE_CAP_MS);
    nextFrame(() =>
      nextFrame(() => {
        quiesce = setTimeout(done, MEASURE_QUIESCE_MS);
        unsubscribe = subscribeMeasuredBounds(() => {
          clearTimeout(quiesce);
          quiesce = setTimeout(done, MEASURE_QUIESCE_MS);
        });
      }),
    );
  });
}

/** POST design + measured footprints back to the sidecar; a failed reply
 *  surfaces via the sidecar's own request timeout. */
export async function respondToDesignRequest(id: number): Promise<void> {
  await measuredSettled();
  const { label, pages, variables, csvMapping, mcpServerPort, mcpServerToken } =
    useLabelStore.getState();
  const designFile: unknown = JSON.parse(serializeDesign(label, pages, variables, csvMapping));
  // A deleted object's leftover footprint must not ride along.
  const liveIds = new Set(pages.flatMap((p) => exportableLeaves(p.objects)).map((o) => o.id));
  const measured = Object.fromEntries(
    [...measuredBoundsMap()].filter(([objectId]) => liveIds.has(objectId)),
  );
  await postDesignResponse(mcpServerPort, mcpServerToken, { id, designFile, measured });
}

/** Register both sidecar listeners, then have Rust flush the events it
 *  queued while none existed (see event_buffer in mcp.rs). */
export function useMcpBridge(): void {
  useEffect(() => {
    if (!isDesktopShell) return;
    const unlisteners: (() => void)[] = [];
    let cancelled = false;
    void (async () => {
      const [{ listen }, { invoke }] = await Promise.all([
        import("@tauri-apps/api/event"),
        import("@tauri-apps/api/core"),
      ]);
      const fns = await Promise.all([
        listen<string>("mcp://open-draft", (e) => useLabelStore.getState().loadDesignText(e.payload)),
        listen<number>("mcp://design-request", (e) => {
          void respondToDesignRequest(e.payload).catch(() => undefined);
        }),
      ]);
      if (cancelled) {
        for (const fn of fns) fn();
        return;
      }
      unlisteners.push(...fns);
      await invoke("mcp_listeners_ready");
    })()
      // Non-actionable on failure; swallow like the boot-start in main.tsx.
      .catch(() => undefined);
    return () => {
      cancelled = true;
      for (const fn of unlisteners) fn();
    };
  }, []);
}
