import { useEffect, useRef, useState } from "react";
import { useCopyToClipboard } from "./useCopyToClipboard";
import { useLabelStore } from "../store/labelStore";
import {
  mcpConfigSnippet,
  mcpServerStatus,
  startMcpServer,
  stopMcpServer,
} from "../lib/mcpServer";

export type RunState =
  | { kind: "stopped" }
  | { kind: "starting" }
  | { kind: "running" }
  | { kind: "error"; message: string };

/** Re-stamp the sidecar-capability fact while it is unknown. The boot ping
 *  (main.tsx) stamps it once; mounting this in the settings modal recovers the
 *  MCP tab without a restart if that ping never landed. */
export function useMcpAvailability(): void {
  const available = useLabelStore((s) => s.mcpSidecarAvailable);
  useEffect(() => {
    if (available !== null) return;
    let cancelled = false;
    void mcpServerStatus()
      .then((s) => {
        if (!cancelled) useLabelStore.getState().setMcpSidecarAvailable(s.available);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [available]);
}

export interface McpServerController {
  run: RunState;
  enabled: boolean;
  port: number;
  token: string;
  running: boolean;
  toggle: (checked: boolean) => void;
  regenerate: () => void;
  setPort: (port: number) => void;
  copy: () => void;
  copied: boolean;
}

/** Orchestration for the local MCP loopback server: the RunState machine, the
 *  start/stop toggle, and the mount reconcile with the real sidecar. Keeps this
 *  side-effect logic out of the view. */
export function useMcpServer(): McpServerController {
  const enabled = useLabelStore((s) => s.mcpServerEnabled);
  const port = useLabelStore((s) => s.mcpServerPort);
  const token = useLabelStore((s) => s.mcpServerToken);
  const setEnabled = useLabelStore((s) => s.setMcpServerEnabled);
  const setPortState = useLabelStore((s) => s.setMcpServerPort);
  const regenerate = useLabelStore((s) => s.regenerateMcpToken);

  const [run, setRun] = useState<RunState>({ kind: "stopped" });
  // Serialize sidecar calls in intent order and run only the newest transition:
  // a superseded op is skipped before it reaches the backend, so a stale stop
  // can't kill a just-started server (nor desync the UI from it).
  const runSeq = useRef(0);
  const opChain = useRef<Promise<void>>(Promise.resolve());
  const enqueue = (op: (current: () => boolean) => Promise<void>) => {
    const seq = ++runSeq.current;
    const current = () => runSeq.current === seq;
    opChain.current = opChain.current.then(() => op(current)).catch(() => undefined);
  };
  // resetSettings can flip the opt-in off without unmounting; derive the shown
  // state from it so a stale local "running" can't outlive the toggle.
  const shownRun: RunState = enabled ? run : { kind: "stopped" };
  const running = shownRun.kind === "running" || shownRun.kind === "starting";

  const { copy, copied } = useCopyToClipboard(() => mcpConfigSnippet(port, token));

  const fail = (e: unknown) => {
    setRun({ kind: "error", message: e instanceof Error ? e.message : String(e) });
  };

  // Mount reconcile: a persisted opt-in that never started re-attempts so
  // the reason shows. Keychain hydrate first: display and restart must see
  // the stored token, not mint a fresh one over it.
  useEffect(() => {
    let mounted = true;
    enqueue(async (current) => {
      await useLabelStore.getState().hydrateMcpToken();
      // catch: a rejected status must not be an unhandled rejection.
      const status = await mcpServerStatus().catch(() => null);
      if (!status || !mounted || !current()) return;
      if (status.running) {
        setRun({ kind: "running" });
        return;
      }
      const s = useLabelStore.getState();
      if (!status.available || !s.mcpServerEnabled) return;
      setRun({ kind: "starting" });
      try {
        const restartToken = await s.ensureMcpToken();
        await startMcpServer({ port: s.mcpServerPort, token: restartToken });
        if (mounted && current()) setRun({ kind: "running" });
      } catch (e) {
        if (mounted && current()) fail(e);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const toggle = (checked: boolean) => {
    if (checked) {
      setEnabled(true);
      setRun({ kind: "starting" });
    } else {
      setEnabled(false); // shownRun derives "stopped" from the opt-in immediately
    }
    enqueue(async (current) => {
      if (!current()) return; // superseded: don't send a stale start/stop
      try {
        if (checked) {
          const token = await useLabelStore.getState().ensureMcpToken();
          if (!current()) return;
          await startMcpServer({ port: useLabelStore.getState().mcpServerPort, token });
          if (current()) setRun({ kind: "running" });
        } else {
          await stopMcpServer().catch(() => undefined);
          if (current()) setRun({ kind: "stopped" });
        }
      } catch (e) {
        if (current()) fail(e);
      }
    });
  };

  const setPort = (next: number) => setPortState(Math.min(65535, Math.max(1024, next)));

  return { run: shownRun, enabled, port, token, running, toggle, regenerate, setPort, copy, copied };
}
