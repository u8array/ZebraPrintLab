import type { PrinterSettingsTab } from "../../store/slices/uiSlice";

/** Capability gates for conditional settings tabs; absent = always visible.
 *  Gates both the rail entry and the content pane. */
export interface TabGateCtx {
  mcpSidecarAvailable: boolean | null;
}

export const TAB_GATES: Partial<Record<PrinterSettingsTab, (ctx: TabGateCtx) => boolean>> = {
  // Web and sidecar-less releases report unavailable, so one fact gates both.
  mcpServer: (ctx) => ctx.mcpSidecarAvailable === true,
};
