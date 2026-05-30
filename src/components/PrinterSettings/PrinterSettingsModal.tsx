import { useId, type FC } from "react";
import { CheckIcon, ClipboardDocumentIcon, TrashIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useCopyToClipboard } from "../../lib/useCopyToClipboard";
import { useT } from "../../lib/useT";
import { generateSetupScript } from "../../lib/zplSetupScript";
import { useLabelStore, type PrinterSettingsTab } from "../../store/labelStore";
import type { PrinterProfile } from "../../types/PrinterProfile";
import { DialogShell } from "../ui/DialogShell";
import { ZplLine } from "../Output/ZplLine";
import { ClockAndTimeTab } from "./ClockAndTimeTab";
import { EncodingAndLanguageTab } from "./EncodingAndLanguageTab";
import { IdentityTab } from "./IdentityTab";
import { MediaFeedTab } from "./MediaFeedTab";
import { PrintQualityTab } from "./PrintQualityTab";

type TopTabId = 'perLabel' | 'setupScript';

/** Sub-tab → top-tab assignment. `satisfies` makes TypeScript flag
 *  any `PrinterSettingsTab` literal that is added to the union but
 *  forgotten here — without this, a missing tab would silently
 *  default at runtime. This is the source of truth; rail groups
 *  below are derived from it. */
const TOP_TAB_OF = {
  mediaFeed: 'perLabel',
  printQuality: 'perLabel',
  clockTime: 'setupScript',
  encodingLanguage: 'setupScript',
  identity: 'setupScript',
} as const satisfies Record<PrinterSettingsTab, TopTabId>;

const TOP_TAB_ORDER: readonly TopTabId[] = ['perLabel', 'setupScript'];

const TOP_TAB_LABEL_KEY = {
  perLabel: 'railGroupPerLabel',
  setupScript: 'railGroupSetupScript',
} as const satisfies Record<TopTabId, 'railGroupPerLabel' | 'railGroupSetupScript'>;

/** Rail-tab order per top-tab, derived from TOP_TAB_OF so the source
 *  of truth stays the single literal map above. Iteration order over
 *  TOP_TAB_OF entries is insertion order, which is the desired rail
 *  order — keep entries in the map in the order the rail should show
 *  them. Seed is derived from TOP_TAB_ORDER so a new TopTabId added
 *  there can't silently produce `undefined.push(...)` at runtime. */
const TABS_BY_TOP_TAB: Record<TopTabId, readonly PrinterSettingsTab[]> = (() => {
  const acc = Object.fromEntries(
    TOP_TAB_ORDER.map((id) => [id, [] as PrinterSettingsTab[]]),
  ) as Record<TopTabId, PrinterSettingsTab[]>;
  for (const [sub, top] of Object.entries(TOP_TAB_OF) as [PrinterSettingsTab, TopTabId][]) {
    acc[top].push(sub);
  }
  return acc;
})();

/** Per-tab content registry. Tabs absent here render as disabled
 *  WIP rail entries; the rail prevents selection so the modal
 *  never has to handle a missing-component branch. */
const TAB_COMPONENTS: Partial<Record<PrinterSettingsTab, FC>> = {
  mediaFeed: MediaFeedTab,
  printQuality: PrintQualityTab,
  clockTime: ClockAndTimeTab,
  encodingLanguage: EncodingAndLanguageTab,
  identity: IdentityTab,
};

/** Modal-box class kept as a constant rather than inline so the
 *  width / shadow tuning is named and stays consistent if other
 *  modals adopt the same shell. Fixed height (h-[600px]) so the
 *  modal does not resize when switching tabs of different field
 *  counts; the docked preview anchors at the bottom. `max-h-[85vh]`
 *  is a fallback cap for very short viewports. */
const MODAL_BOX_CLS =
  "bg-surface border border-border rounded-lg shadow-2xl " +
  "w-[720px] max-w-[95vw] h-[600px] max-h-[85vh] flex flex-col overflow-hidden";

/** Docked preview height. 160px = ~9 lines of mono ZPL at 13px/1.45
 *  plus the header strip and padding. Fixed (not collapsible) so the
 *  modal's vertical rhythm stays identical across top-tabs; the empty
 *  per-label state keeps the same height as the populated setup-script
 *  state. */
const PREVIEW_HEIGHT = "h-40";

export function PrinterSettingsModal() {
  const t = useT();
  const tab = useLabelStore((s) => s.printerSettingsTab);
  const setTab = useLabelStore((s) => s.setPrinterSettingsTab);
  const printerProfile = useLabelStore((s) => s.printerProfile);
  const resetPrinterProfile = useLabelStore((s) => s.resetPrinterProfile);
  const openZebraPrint = useLabelStore((s) => s.openZebraPrint);
  const titleId = useId();
  const subtitleId = useId();

  if (!tab) return null;

  const activeTopTab = TOP_TAB_OF[tab];
  const activeTabs = TABS_BY_TOP_TAB[activeTopTab];
  const activeLabelKey = TOP_TAB_LABEL_KEY[activeTopTab];
  const ActiveTab = TAB_COMPONENTS[tab];

  const setupScript = generateSetupScript(printerProfile);

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

      <div
        // Plain nav, not tablist. The rail below uses `aria-current`
        // (page-style) navigation buttons; using `role="tablist"`
        // here as well would force the rail into tab semantics too,
        // and a single page with two different "tab" paradigms is
        // worse than two plain navs.
        className="px-5 pt-3 border-b border-border flex gap-1"
        aria-label={t.printerSettings.title}
      >
        {TOP_TAB_ORDER.map((id) => {
          const active = id === activeTopTab;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                if (!active) {
                  const first = TABS_BY_TOP_TAB[id][0];
                  if (first) setTab(first);
                }
              }}
              className={
                "px-3 py-2 -mb-px border-b-2 text-xs font-medium transition-colors " +
                (active
                  ? "text-accent border-accent"
                  : "text-muted border-transparent hover:text-text")
              }
            >
              {t.printerSettings[TOP_TAB_LABEL_KEY[id]]}
            </button>
          );
        })}
      </div>

      <div className="flex-1 flex min-h-0">
        <nav
          className="w-44 shrink-0 border-r border-border bg-surface-2/40 py-2"
          aria-label={t.printerSettings[activeLabelKey]}
        >
          {activeTabs.map((id) => (
            <TabRailRow
              key={id}
              id={id}
              active={id === tab}
              onClick={() => setTab(id)}
              label={t.printerSettings.tabs[id]}
              wipLabel={t.printerSettings.wip}
            />
          ))}
        </nav>

        <section className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
          {ActiveTab && <ActiveTab />}
        </section>
      </div>

      {activeTopTab === 'setupScript' && (
        <PreviewDock
          setupScript={setupScript}
          printerProfile={printerProfile}
          onClear={resetPrinterProfile}
          onSend={() => {
            setTab(null);
            openZebraPrint('setupScript');
          }}
        />
      )}

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

/** Docked preview pane at the bottom of the modal, rendered only on
 *  the Setup-Script top-tab. Shows the freshly-generated script plus
 *  Copy + Send actions. Per-Label has no preview here because per-
 *  label ZPL still lives in the editor's main output panel. */
function PreviewDock({
  setupScript,
  printerProfile,
  onClear,
  onSend,
}: {
  setupScript: string;
  printerProfile: PrinterProfile;
  onClear: () => void;
  onSend: () => void;
}) {
  const t = useT();
  // Live-clock mode (useCurrentTimeForClock) needs the payload
  // freshly generated at click-time, not the closured snapshot.
  const { copy, copied } = useCopyToClipboard(() => generateSetupScript(printerProfile));

  const hasScript = !!setupScript;

  return (
    <div className={`${PREVIEW_HEIGHT} shrink-0 border-t border-border flex flex-col bg-surface`}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <span className="font-mono text-[10px] text-muted uppercase tracking-widest">
          {t.printerSettings.previewHeading}
        </span>
        <div className="flex items-center gap-3">
          {/* Clear sits on the destructive side of a divider so the
              red-hover affordance + spatial separation make a mis-
              click into the adjacent primary (Send) much less
              likely. Same muted resting state as Copy keeps the
              header visually quiet until hover. */}
          <button
            type="button"
            onClick={onClear}
            disabled={!hasScript}
            title={t.printerSettings.previewClear}
            // Destructive intent: red hover AND a red focus ring so
            // keyboard users see the same warning the mouse hover
            // gives. Without the ring keyboard-tab onto Clear shows
            // the default browser focus style — identical to Copy /
            // Send next to it.
            className="flex items-center gap-1 font-mono text-[10px] text-muted hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 rounded disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            <TrashIcon className="w-4 h-4" />
            {t.printerSettings.previewClear}
          </button>
          <span aria-hidden="true" className="w-px h-4 bg-border" />
          <button
            type="button"
            onClick={copy}
            disabled={!hasScript}
            title={t.output.copy}
            className="flex items-center gap-1 font-mono text-[10px] text-muted hover:text-accent disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            {copied
              ? <><CheckIcon className="w-4 h-4" />{t.output.copied}</>
              : <><ClipboardDocumentIcon className="w-4 h-4" />{t.output.copy}</>}
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={!hasScript}
            className="px-3 py-1 rounded text-[11px] bg-accent text-bg hover:bg-accent/90 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            {t.printerSettings.sendToZebra}
          </button>
        </div>
      </div>

      <pre className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed text-text m-0">
        {hasScript
          ? setupScript.split('\n').map((line, i) => <ZplLine key={i} line={line} />)
          : null
        }
      </pre>
    </div>
  );
}

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
