import { useState, useEffect, useRef } from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { ObjectPalette } from "./Palette/ObjectPalette";
import { LabelCanvas } from "./Canvas/LabelCanvas";
import type { LabelCanvasHandle } from "./Canvas/LabelCanvas";
import { RightSidebar } from "./RightSidebar/RightSidebar";
import { ZPLOutput } from "./Output/ZPLOutput";
import { ZplImportModal } from "./Output/ZplImportModal";
import { VariableMappingModal } from "./Variables/VariableMappingModal";
import { CsvImportConfirmDialog } from "./Variables/CsvImportConfirmDialog";
import { PrintToZebraDialog } from "./Output/PrintToZebraDialog";
import {
  DropdownMenu,
  DropdownItem,
  DropdownSeparator,
} from "./ui/DropdownMenu";
import { GitHubIcon } from "./ui/GitHubIcon";
import { Tooltip } from "./ui/Tooltip";
import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  DocumentPlusIcon,
  DocumentDuplicateIcon,
  FolderOpenIcon,
  DocumentArrowDownIcon,
  TableCellsIcon,
  PrinterIcon,
  Cog6ToothIcon,
  PaperAirplaneIcon,
  GlobeAltIcon,
  XMarkIcon,
  SunIcon,
  MoonIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from "@heroicons/react/16/solid";
import { useLabelStore, useHistory, selectLabelaryNoticeRequired } from "../store/labelStore";
import { LabelaryNoticeModal } from "./Output/LabelaryNoticeModal";
import { PrinterSettingsModal } from "./PrinterSettings/PrinterSettingsModal";
import { localeNames } from "../locales";
import type { LocaleCode } from "../locales";
import { mmToUnit } from "../lib/units";
import { useT } from "../lib/useT";
import { kbd } from "../lib/kbd";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { useDesignFileActions } from "../hooks/useDesignFileActions";
import { useCsvImportActions } from "../hooks/useCsvImportActions";
import { useZplImportExport } from "../hooks/useZplImportExport";
import { useOutputPanel, OUTPUT_DEFAULT_H } from "../hooks/useOutputPanel";
import { useCollapsiblePanel } from "../hooks/useCollapsiblePanel";

/** Thin clickable rail shown in place of a collapsed side panel; clicking it
 *  brings the panel back. Chevrons point toward the canvas (the panel's slot). */
function ExpandStrip({
  side,
  onExpand,
  title,
}: {
  side: "left" | "right";
  onExpand: () => void;
  title: string;
}) {
  const Icon = side === "left" ? ChevronDoubleRightIcon : ChevronDoubleLeftIcon;
  return (
    <button
      onClick={onExpand}
      title={title}
      aria-label={title}
      className={`w-5 shrink-0 ${
        side === "left" ? "border-r" : "border-l"
      } border-border bg-surface hover:bg-surface-2 flex items-start justify-center pt-2 text-muted hover:text-text transition-colors`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

export function AppShell() {
  const t = useT();
  const label = useLabelStore((s) => s.label);
  const pages = useLabelStore((s) => s.pages);
  const selectObject = useLabelStore((s) => s.selectObject);
  const addPage = useLabelStore((s) => s.addPage);
  const setPrinterSettingsTab = useLabelStore((s) => s.setPrinterSettingsTab);
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
    csvInputRef,
    handleCsvImport,
    csvError,
    dismissCsvError,
    pendingImport,
    confirmPendingImport,
    cancelPendingImport,
  } = useCsvImportActions();
  const csvMappingModalOpen = useLabelStore((s) => s.csvMappingModalOpen);
  const closeCsvMappingModal = useLabelStore((s) => s.closeCsvMappingModal);
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
    handleExportBatch,
    canBatchExport,
    batchRowCount,
    handlePrint,
  } = useZplImportExport();
  const outputPanel = useOutputPanel(OUTPUT_DEFAULT_H);
  const leftPanel = useCollapsiblePanel("zpl-panel-left");
  const rightPanel = useCollapsiblePanel("zpl-panel-right");
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

          <Tooltip content={`${t.app.undo} (${kbd('Z')})`}>
            <button
              onClick={() => undo()}
              disabled={!canUndo}
              aria-label={t.app.undo}
              className="p-1.5 rounded text-muted hover:text-text hover:bg-border disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
          <Tooltip content={`${t.app.redo} (${kbd('Z', { shift: true })})`}>
            <button
              onClick={() => redo()}
              disabled={!canRedo}
              aria-label={t.app.redo}
              className="p-1.5 rounded text-muted hover:text-text hover:bg-border disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowUturnRightIcon className="w-3.5 h-3.5" />
            </button>
          </Tooltip>

          <div className="w-px h-4 bg-border mx-1" />

          <Tooltip content={theme === "dark" ? t.app.themeLight : t.app.themeDark}>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={t.app.themeToggle}
              className="p-1.5 rounded text-muted hover:text-text hover:bg-border transition-colors"
            >
              {theme === "dark" ? (
                <SunIcon className="w-3.5 h-3.5" />
              ) : (
                <MoonIcon className="w-3.5 h-3.5" />
              )}
            </button>
          </Tooltip>

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

          <Tooltip content="GitHub">
            <a
              href="https://github.com/u8array/ZebraPrintLab"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="p-1.5 rounded text-muted hover:text-text hover:bg-border transition-colors"
            >
              <GitHubIcon className="w-3.5 h-3.5" />
            </a>
          </Tooltip>

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
            <DropdownSeparator />
            <DropdownItem
              icon={Cog6ToothIcon}
              onClick={() => setPrinterSettingsTab("mediaFeed")}
            >
              {t.printerSettings.open}
            </DropdownItem>
            <DropdownItem
              icon={ArrowDownTrayIcon}
              onClick={handleDownload}
              disabled={!hasObjects}
            >
              {t.app.exportZpl}
            </DropdownItem>
            {canBatchExport && (
              <DropdownItem
                icon={ArrowDownTrayIcon}
                onClick={handleExportBatch}
                disabled={!hasObjects}
              >
                {t.app.exportBatchZplFmt.replace('{n}', String(batchRowCount))}
              </DropdownItem>
            )}
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
            <DropdownItem
              icon={TableCellsIcon}
              onClick={() => csvInputRef.current?.click()}
            >
              {t.app.importCsvData}
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
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvImport}
          />
        </div>
      </header>

      {/* Notices */}
      {(loadError ?? printError ?? csvError) && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-red-950/40 border-b border-red-800/50 font-mono text-[10px] text-red-300">
          <span className="flex-1">{loadError ?? printError ?? csvError}</span>
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
            onClick={loadError ? dismissLoadError : csvError ? dismissCsvError : dismissPrintError}
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
        {leftPanel.collapsed ? (
          <ExpandStrip side="left" onExpand={leftPanel.expand} title={t.app.expand} />
        ) : (
          <aside className="w-56 shrink-0 border-r border-border bg-surface flex flex-col min-h-0">
            <div className="shrink-0 flex justify-end border-b border-border bg-surface px-1 py-0.5">
              <button
                onClick={leftPanel.collapse}
                title={t.app.collapse}
                aria-label={t.app.collapse}
                className="p-0.5 text-muted hover:text-text transition-colors"
              >
                <ChevronDoubleLeftIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <ObjectPalette />
          </aside>
        )}

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

        {rightPanel.collapsed ? (
          <ExpandStrip side="right" onExpand={rightPanel.expand} title={t.app.expand} />
        ) : (
          <RightSidebar canvasRef={canvasRef} onCollapse={rightPanel.collapse} />
        )}
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
      {csvMappingModalOpen && (
        <VariableMappingModal onClose={closeCsvMappingModal} />
      )}
      {pendingImport && (
        <CsvImportConfirmDialog
          pending={pendingImport}
          onConfirm={confirmPendingImport}
          onCancel={cancelPendingImport}
        />
      )}
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
      <PrinterSettingsModal />
    </div>
  );
}
