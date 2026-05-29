import { useId, type FC } from "react";
import { XMarkIcon } from "@heroicons/react/16/solid";
import { useT } from "../../lib/useT";
import { useLabelStore, type PrinterSettingsTab } from "../../store/labelStore";
import { DialogShell } from "../ui/DialogShell";
import { MediaFeedTab } from "./MediaFeedTab";
import { PrintQualityTab } from "./PrintQualityTab";

/** Tab IDs in display order. The "is this tab shipped?" state is
 *  derived from TAB_COMPONENTS membership below, so adding a tab
 *  is a one-line registry entry plus the locale strings — no dual
 *  source of truth to keep in sync. */
const TABS: readonly PrinterSettingsTab[] = [
  "mediaFeed",
  "printQuality",
  "clockTime",
  "encodingLanguage",
  "identity",
];

/** Per-tab content registry. Tabs absent here render as disabled
 *  WIP rail entries; the rail prevents selection so the modal
 *  never has to handle a missing-component branch. Annotated
 *  (not `satisfies`) so `TAB_COMPONENTS[tab]` returns `FC |
 *  undefined` for any tab id without a narrowing cast. */
const TAB_COMPONENTS: Partial<Record<PrinterSettingsTab, FC>> = {
  mediaFeed: MediaFeedTab,
  printQuality: PrintQualityTab,
};

/** Modal-box class kept as a constant rather than inline so the
 *  width / shadow tuning is named and stays consistent if other
 *  modals adopt the same shell. Fixed height (h-[600px]) so the
 *  modal does not resize when switching tabs of different field
 *  counts — the user keeps the same spatial anchor while content
 *  scrolls inside. `max-h-[85vh]` is a fallback cap for very
 *  short viewports where 600px would overflow. */
const MODAL_BOX_CLS =
  "bg-surface border border-border rounded-lg shadow-2xl " +
  "w-[720px] max-w-[95vw] h-[600px] max-h-[85vh] flex flex-col overflow-hidden";

/** Printer Settings modal — five tabs of pure-ZPL printer config.
 *  Vertical tab rail scales to N tabs and mirrors the
 *  Properties-Panel column-of-sections feel. Instant-apply
 *  semantics: edits commit live to labelConfig (no Save/Cancel),
 *  matching the rest of the editor. Each field's ZPL command sits
 *  docked rightwards via `ZplCommandLabel`. */
export function PrinterSettingsModal() {
  const t = useT();
  const tab = useLabelStore((s) => s.printerSettingsTab);
  const setTab = useLabelStore((s) => s.setPrinterSettingsTab);
  const titleId = useId();
  const subtitleId = useId();

  if (!tab) return null;

  const ActiveTab = TAB_COMPONENTS[tab];

  return (
    <DialogShell
      portal
      labelledBy={titleId}
      describedBy={subtitleId}
      onClose={() => setTab(null)}
      boxClassName={MODAL_BOX_CLS}
    >
      <header className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 id={titleId} className="text-sm font-medium text-text">
            {t.printerSettings.title}
          </h2>
          <p id={subtitleId} className="text-[11px] text-muted">
            {t.printerSettings.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTab(null)}
          aria-label={t.printerSettings.close}
          className="text-muted hover:text-text transition-colors p-1 -m-1"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        <nav
          // Tab-rail width fits the longest localised tab title at
          // 10px-uppercase tracking-wider density across all 32
          // locales (worst case: "Kodierung & Sprache" / "Encoding
          // & Language").
          className="w-44 shrink-0 border-r border-border bg-surface-2/40 py-3"
          aria-label={t.printerSettings.title}
        >
          {TABS.map((id) => {
            const active = id === tab;
            // WIP is derived: a tab is WIP iff no content
            // component is registered for it. Single source of
            // truth, no flag to keep in sync.
            const wip = !(id in TAB_COMPONENTS);
            const railRowCls = active
              ? "text-accent border-accent -ml-px bg-accent/5"
              : wip
                ? "text-muted/40 border-transparent cursor-not-allowed"
                : "text-muted border-transparent hover:text-text hover:bg-surface-2";
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                disabled={wip}
                aria-current={active ? "page" : undefined}
                className={
                  "w-full text-left flex items-center justify-between gap-2 px-3 py-1.5 " +
                  "font-mono text-[10px] uppercase tracking-wider " +
                  "border-l-2 transition-colors " +
                  railRowCls
                }
              >
                <span>{t.printerSettings.tabs[id]}</span>
                {wip && <span className="text-[9px] text-muted/50">{t.printerSettings.wip}</span>}
              </button>
            );
          })}
        </nav>

        <section className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {ActiveTab && <ActiveTab />}
        </section>
      </div>

      <footer className="px-5 py-3 border-t border-border flex items-center justify-between gap-4">
        <span className="text-[11px] text-muted">
          {t.printerSettings.instantApply}
        </span>
        <button
          type="button"
          onClick={() => setTab(null)}
          className="px-4 py-1.5 rounded text-xs bg-surface-2 text-text border border-border hover:bg-surface transition-colors"
        >
          {t.printerSettings.close}
        </button>
      </footer>
    </DialogShell>
  );
}
