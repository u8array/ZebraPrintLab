import { useEffect } from "react";
import { serializeDesign } from "@zplab/core/lib/designFile";
import { measuredBoundsMap } from "../components/Canvas/measuredBoundsCache";
import { postDesignResponse } from "../lib/mcpServer";
import { isDesktopShell } from "../lib/platform";
import { useLabelStore } from "../store/labelStore";

/** Snapshot the store design plus the render-measured footprints and POST
 *  them back to the sidecar. A failed reply is not actionable here; the
 *  sidecar's request timeout turns it into a tool error for the caller. */
export async function respondToDesignRequest(id: number): Promise<void> {
  const { label, pages, variables, csvMapping, mcpServerPort, mcpServerToken } =
    useLabelStore.getState();
  const designFile: unknown = JSON.parse(serializeDesign(label, pages, variables, csvMapping));
  const measured = Object.fromEntries(measuredBoundsMap());
  await postDesignResponse(mcpServerPort, mcpServerToken, { id, designFile, measured });
}

/** Answer the sidecar's get_current_design requests. */
export function useMcpDesignRequest(): void {
  useEffect(() => {
    if (!isDesktopShell) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<number>("mcp://design-request", (e) => {
          void respondToDesignRequest(e.payload).catch(() => undefined);
        }),
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      // Bridge setup is desktop-only and non-actionable if it fails; swallow so
      // it is not an unhandled rejection (matches the open-draft listener).
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
