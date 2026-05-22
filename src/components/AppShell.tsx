import { useState, useEffect, useRef } from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { ObjectPalette } from "./Palette/ObjectPalette";
import { LabelCanvas } from "./Canvas/LabelCanvas";
import type { LabelCanvasHandle } from "./Canvas/LabelCanvas";
import { RightSidebar } from "./RightSidebar/RightSidebar";
import { ZPLOutput } from "./Output/ZPLOutput";
import { ZplImportModal } from "./Output/ZplImportModal";
import { PrintToZebraDialog } from "./Output/PrintToZebraDialog";
import {
  DropdownMenu,
  DropdownItem,
  DropdownSeparator,
} from "./ui/DropdownMenu";
import { GitHubIcon } from "./ui/GitHubIcon";
import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  DocumentPlusIcon,
  DocumentDuplicateIcon,
  FolderOpenIcon,
  DocumentArrowDownIcon,
  PrinterIcon,
  PaperAirplaneIcon,
  GlobeAltIcon,
  XMarkIcon,
  SunIcon,
  MoonIcon,
} from "@heroicons/react/16/solid";
import { useLabelStore, useHistory, selectLabelaryNoticeRequired } from "../store/labelStore";
import { LabelaryNoticeModal } from "./Output/LabelaryNoticeModal";
import { localeNames } from "../locales";
import type { LocaleCode } from "../locales";
import { mmToUnit } from "../lib/units";
import { useT } from "../lib/useT";
import { kbd } from "../lib/kbd";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { useDesignFileActions } from "../hooks/useDesignFileActions";
import { useZplImportExport } from "../hooks/useZplImportExport";
import { useOutputPanel, OUTPUT_DEFAULT_H } from "../hooks/useOutputPanel";

export function AppShell() {
  const t = useT();
  const label = useLabelStore((s) => s.label);
  const pages = useLabelStore((s) => s.pages);
  const selectObject = useLabelStore((s) => s.selectObject);
  const addPage = useLabelStore((s) => s.addPage);
  const locale = useLabelStore((s) => s.locale);
  const setLocale = useLabelStore((s) => s.setLocale);
  const theme = useLabelStore((s) => s.theme);
  const setTheme = useLabelStore((s) => s.setTheme);
  const labelaryEnabled = useLabelStore((s) => s.thirdParty.labelary);
  const noticeRequired = useLabelStore(selectLabelaryNoticeRequired);
  const [showPrintNotice, setShowPrintNotice] = useState(false);

  // Bridge the theme preference to <html data-theme> so the CSS variables in
  // index.css pick it up.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  const { undo, redo, pastStates, futureStates } = useHistory();
  const canvasSettings = useLabelStore((s) => s.canvasSettings);
  const setCanvasSettings = useLabelStore((s) => s.setCanvasSettings);
  const { showGrid, snapEnabled, snapSizeMm, unit } = canvasSettings;

  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;
  const hasObjects = pages.some((p) => p.objects.length > 0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useGlobalShortcuts();
  const { handleNew, handleSave, handleLoad, loadInputRef, loadError, dismissLoadError } = useDesignFileActions();
  const {
    showZplImport,
    openZplImport,
    closeZplImport,
    showZebraPrint,
    openZebraPrint,
    closeZebraPrint,
    currentZpl,
    printError,
    dismissPrintError,
    handleDownload,
    handlePrint,
  } = useZplImportExport();
  const outputPanel = useOutputPanel(OUTPUT_DEFAULT_H);
  // Imperative handle to the canvas for actions PropertiesPanel needs live
  // render bboxes for (e.g. align-to-label centring).
  const canvasRef = useRef<LabelCanvasHandle>(null);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg text-text font-sans">
      {/* Header */}
      <header className="h-11 shrink-0 flex items-center justify-between px-4 border-b border-border bg-surface-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => selectObject(null)}
            className="text-accent font-semibold tracking-tight text-sm hover:opacity-75 transition-opacity"
          >
            Zebra Print Lab
          </button>
          <span className="text-border-2 select-none">·</span>
          <span className="font-mono text-xs text-muted">
            {mmToUnit(label.widthMm, unit)} × {mmToUnit(label.heightMm, unit)} {unit} · {label.dpmm} dpmm
          </span>
        </div>

        <div className="flex items-center gap-1">
          <div className="w-px h-4 bg-border mx-1" />

          <button
            onClick={() => undo()}
            disabled={!canUndo}
            title={`${t.app.undo} (${kbd('Z')})`}
            aria-label={t.app.undo}
            className="p-1.5 rounded text-muted hover:text-text hover:bg-border disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo}
            title={`${t.app.redo} (${kbd('Z', { shift: true })})`}
            aria-label={t.app.redo}
            className="p-1.5 rounded text-muted hover:text-text hover:bg-border disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowUturnRightIcon className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? t.app.themeLight : t.app.themeDark}
            aria-label={t.app.themeToggle}
            className="p-1.5 rounded text-muted hover:text-text hover:bg-border transition-colors"
          >
            {theme === "dark" ? (
              <SunIcon className="w-3.5 h-3.5" />
            ) : (
              <MoonIcon className="w-3.5 h-3.5" />
            )}
          </button>

          <DropdownMenu
            label={<GlobeAltIcon className="w-3.5 h-3.5" />}
            maxHeight="260px"
          >
            {(Object.entries(localeNames) as [LocaleCode, string][]).map(
              ([code, name]) => (
                <DropdownItem
                  key={code}
                  onClick={() => setLocale(code)}
                  shortcut={code === locale ? "✓" : undefined}
                >
                  {name}
                </DropdownItem>
              ),
            )}
          </DropdownMenu>

          <a
            href="https://github.com/u8array/ZebraPrintLab"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub"
            className="p-1.5 rounded text-muted hover:text-text hover:bg-border transition-colors"
          >
            <GitHubIcon className="w-3.5 h-3.5" />
          </a>

          <div className="w-px h-4 bg-border mx-1" />

          <DropdownMenu label={t.app.file}>
            <DropdownItem icon={DocumentPlusIcon} onClick={handleNew}>
              {t.app.newDesign}
            </DropdownItem>
            <DropdownItem icon={DocumentDuplicateIcon} onClick={addPage}>
              {t.app.addPage}
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={ArrowUpTrayIcon} onClick={openZplImport}>
              {t.app.importZpl}
            </DropdownItem>
            <DropdownItem
              icon={ArrowDownTrayIcon}
              onClick={handleDownload}
              disabled={!hasObjects}
            >
              {t.app.exportZpl}
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem
              icon={FolderOpenIcon}
              onClick={() => loadInputRef.current?.click()}
            >
              {t.app.openDesign}
            </DropdownItem>
            <DropdownItem
              icon={DocumentArrowDownIcon}
              onClick={handleSave}
              disabled={!hasObjects}
            >
              {t.app.saveDesign}
            </DropdownItem>
            <DropdownSeparator />
            {/* Print routes through Labelary. The button is shown whenever
                the Labelary gate is on; clicking it before the notice has
                been acknowledged opens the disclosure first, then prints. */}
            {labelaryEnabled && (
              <DropdownItem
                icon={PrinterIcon}
                onClick={() => (noticeRequired ? setShowPrintNotice(true) : handlePrint())}
                disabled={!hasObjects}
              >
                {t.app.print}
              </DropdownItem>
            )}
            <DropdownItem
              icon={PaperAirplaneIcon}
              onClick={openZebraPrint}
              disabled={!hasObjects}
            >
              {t.app.sendToZebra}
            </DropdownItem>
          </DropdownMenu>

          <input
            ref={loadInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleLoad}
          />
        </div>
      </header>

      {/* Notices */}
      {(loadError ?? printError) && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-red-950/40 border-b border-red-800/50 font-mono text-[10px] text-red-300">
          <span className="flex-1">{loadError ?? printError}</span>
          {printError && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 text-red-300 hover:text-red-100 transition-colors shrink-0"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
              Export ZPL
            </button>
          )}
          <button
            onClick={loadError ? dismissLoadError : dismissPrintError}
            className="text-red-400 hover:text-red-200 transition-colors"
            aria-label="Dismiss"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main area: 3 columns */}
      <DndContext sensors={sensors}>
      <div className="flex flex-1 min-h-0">
        <aside className="w-44 shrink-0 border-r border-border bg-surface overflow-y-auto">
          <ObjectPalette />
        </aside>

        <main className="flex-1 overflow-hidden">
          <LabelCanvas
            ref={canvasRef}
            unit={unit}
            showGrid={showGrid}
            onGridToggle={() => setCanvasSettings({ showGrid: !showGrid })}
            snapEnabled={snapEnabled}
            onSnapToggle={() => setCanvasSettings({ snapEnabled: !snapEnabled })}
            snapSizeMm={snapSizeMm}
            onSnapSizeChange={(v) => setCanvasSettings({ snapSizeMm: v })}
            zoom={canvasSettings.zoom}
            onZoomChange={(v) => setCanvasSettings({ zoom: v })}
            viewRotation={canvasSettings.viewRotation}
            onViewRotationChange={(v) => setCanvasSettings({ viewRotation: v })}
          />
        </main>

        <RightSidebar canvasRef={canvasRef} />
      </div>
      </DndContext>

      {/* Output panel */}
      <div
        className="shrink-0 border-t border-border flex flex-col bg-surface-2"
        style={{ height: outputPanel.collapsed ? "auto" : outputPanel.height }}
      >
        <div
          className="h-1.5 shrink-0 cursor-row-resize hover:bg-accent/30 transition-colors"
          onMouseDown={outputPanel.onMouseDown}
        />
        <div className="flex-1 overflow-hidden">
          <ZPLOutput
            collapsed={outputPanel.collapsed}
            onCollapse={outputPanel.collapse}
            onExpand={outputPanel.expand}
          />
        </div>
      </div>

      {showZplImport && <ZplImportModal onClose={closeZplImport} />}
      {showZebraPrint && (
        <PrintToZebraDialog zpl={currentZpl()} onClose={closeZebraPrint} />
      )}
      {showPrintNotice && (
        <LabelaryNoticeModal
          onClose={() => setShowPrintNotice(false)}
          onContinue={() => {
            setShowPrintNotice(false);
            handlePrint();
          }}
        />
      )}
    </div>
  );
}
