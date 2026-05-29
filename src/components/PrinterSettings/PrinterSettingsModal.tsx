import { useId, type FC } from "react";
import { XMarkIcon } from "@heroicons/react/16/solid";
import { useT } from "../../lib/useT";
import { useLabelStore, type PrinterSettingsTab } from "../../store/labelStore";
import { DialogShell } from "../ui/DialogShell";
import { ClockAndTimeTab } from "./ClockAndTimeTab";
import { MediaFeedTab } from "./MediaFeedTab";
import { PrintQualityTab } from "./PrintQualityTab";

/** Tab rail grouped by ZPL output channel. The Modal emits two
 *  separate outputs in the ZPL panel (per-label and Setup-Script);
 *  grouping the tabs the same way makes the split discoverable
 *  without an explicit label on every field. "is this tab shipped?"
 *  is still derived from TAB_COMPONENTS membership below — adding
 *  a tab is a one-line entry in the right group plus the locale
 *  strings, no separate WIP flag to keep in sync. */
const RAIL_GROUPS: readonly {
  labelKey: 'railGroupPerLabel' | 'railGroupSetupScript';
  tabs: readonly PrinterSettingsTab[];
}[] = [
  { labelKey: 'railGroupPerLabel', tabs: ['mediaFeed', 'printQuality'] },
  { labelKey: 'railGroupSetupScript', tabs: ['clockTime', 'encodingLanguage', 'identity'] },
];

/** Per-tab content registry. Tabs absent here render as disabled
 *  WIP rail entries; the rail prevents selection so the modal
 *  never has to handle a missing-component branch. Annotated
 *  (not `satisfies`) so `TAB_COMPONENTS[tab]` returns `FC |
 *  undefined` for any tab id without a narrowing cast. */
const TAB_COMPONENTS: Partial<Record<PrinterSettingsTab, FC>> = {
  mediaFeed: MediaFeedTab,
  printQuality: PrintQualityTab,
  clockTime: ClockAndTimeTab,
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
          className="w-44 shrink-0 border-r border-border bg-surface-2/40 py-2"
          aria-label={t.printerSettings.title}
        >
          {RAIL_GROUPS.map((group, idx) => (
            <div
              key={group.labelKey}
              className={idx > 0 ? "mt-3 pt-3 border-t border-border" : undefined}
            >
              <div className="px-3 pb-1 font-mono text-[9px] uppercase tracking-widest text-muted/50">
                {t.printerSettings[group.labelKey]}
              </div>
              {group.tabs.map((id) => (
                <TabRailRow
                  key={id}
                  id={id}
                  active={id === tab}
                  onClick={() => setTab(id)}
                  label={t.printerSettings.tabs[id]}
                  wipLabel={t.printerSettings.wip}
                />
              ))}
            </div>
          ))}
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

/** Single rail row. WIP state is derived from TAB_COMPONENTS so the
 *  rail stays in sync without an extra flag (adding a tab to
 *  TAB_COMPONENTS automatically removes the WIP styling). */
function TabRailRow({
  id,
  active,
  onClick,
  label,
  wipLabel,
}: {
  id: PrinterSettingsTab;
  active: boolean;
  onClick: () => void;
  label: string;
  wipLabel: string;
}) {
  const wip = !(id in TAB_COMPONENTS);
  const cls = active
    ? "text-accent border-accent -ml-px bg-accent/5"
    : wip
      ? "text-muted/40 border-transparent cursor-not-allowed"
      : "text-muted border-transparent hover:text-text hover:bg-surface-2";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={wip}
      aria-current={active ? "page" : undefined}
      className={
        "w-full text-left flex items-center justify-between gap-2 px-3 py-1.5 " +
        "font-mono text-[10px] uppercase tracking-wider " +
        "border-l-2 transition-colors " +
        cls
      }
    >
      <span>{label}</span>
      {wip && <span className="text-[9px] text-muted/50">{wipLabel}</span>}
    </button>
  );
}
