import { useState } from "react";
import { ObjectPalette } from "./Palette/ObjectPalette";
import { LabelCanvas } from "./Canvas/LabelCanvas";
import { PropertiesPanel } from "./Properties/PropertiesPanel";
import { LayersPanel } from "./Properties/LayersPanel";
import { ZPLOutput } from "./Output/ZPLOutput";
import { ZplImportModal } from "./Output/ZplImportModal";
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
  FolderOpenIcon,
  DocumentArrowDownIcon,
  PrinterIcon,
  GlobeAltIcon,
  XMarkIcon,
} from "@heroicons/react/16/solid";
import { useLabelStore, useHistory } from "../store/labelStore";
import { localeNames } from "../locales";
import type { LocaleCode } from "../locales";
import { mmToUnit } from "../lib/units";
import { useT } from "../lib/useT";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { useDesignFileActions } from "../hooks/useDesignFileActions";
import { useZplImportExport } from "../hooks/useZplImportExport";
import { useOutputPanel, OUTPUT_DEFAULT_H } from "../hooks/useOutputPanel";

export function AppShell() {
  const t = useT();
  const label = useLabelStore((s) => s.label);
  const objects = useLabelStore((s) => s.objects);
  const selectObject = useLabelStore((s) => s.selectObject);
  const locale = useLabelStore((s) => s.locale);
  const setLocale = useLabelStore((s) => s.setLocale);
  const { undo, redo, pastStates, futureStates } = useHistory();
  const canvasSettings = useLabelStore((s) => s.canvasSettings);
  const setCanvasSettings = useLabelStore((s) => s.setCanvasSettings);
  const { showGrid, snapEnabled, snapSizeMm, unit } = canvasSettings;
  const [rightTab, setRightTab] = useState<"properties" | "layers">("properties");

  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;
  const hasObjects = objects.length > 0;

  useGlobalShortcuts();
  const { handleNew, handleSave, handleLoad, loadInputRef, loadError, dismissLoadError } = useDesignFileActions();
  const {
    showZplImport,
    openZplImport,
    closeZplImport,
    printError,
    dismissPrintError,
    handleDownload,
    handlePrint,
  } = useZplImportExport();
  const outputPanel = useOutputPanel(OUTPUT_DEFAULT_H);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg text-text font-sans">
      {/* Header */}
      <header className="h-11 shrink-0 flex items-center justify-between px-4 border-b border-border bg-surface">
        <div className="flex items-center gap-3">
          <button
            onClick={() => selectObject(null)}
            className="text-accent font-semibold tracking-tight text-sm hover:opacity-75 transition-opacity"
          >
            ZPL Designer
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
            title="Undo (⌘Z)"
            className="p-1.5 rounded text-muted hover:text-text hover:bg-surface-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo}
            title="Redo (⌘⇧Z)"
            className="p-1.5 rounded text-muted hover:text-text hover:bg-surface-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowUturnRightIcon className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

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
            href="https://github.com/u8array/zpl_label_designer"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub"
            className="p-1.5 rounded text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <GitHubIcon className="w-3.5 h-3.5" />
          </a>

          <div className="w-px h-4 bg-border mx-1" />

          <DropdownMenu label={t.app.file}>
            <DropdownItem icon={DocumentPlusIcon} onClick={handleNew}>
              {t.app.newDesign}
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
            <DropdownItem
              icon={PrinterIcon}
              onClick={handlePrint}
              disabled={!hasObjects}
            >
              {t.app.print}
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
      <div className="flex flex-1 min-h-0">
        <aside className="w-44 shrink-0 border-r border-border bg-surface overflow-y-auto">
          <ObjectPalette />
        </aside>

        <main className="flex-1 overflow-hidden">
          <LabelCanvas
            unit={unit}
            showGrid={showGrid}
            onGridToggle={() => setCanvasSettings({ showGrid: !showGrid })}
            snapEnabled={snapEnabled}
            onSnapToggle={() => setCanvasSettings({ snapEnabled: !snapEnabled })}
            snapSizeMm={snapSizeMm}
            onSnapSizeChange={(v) => setCanvasSettings({ snapSizeMm: v })}
            zoom={canvasSettings.zoom}
            onZoomChange={(v) => setCanvasSettings({ zoom: v })}
          />
        </main>

        <aside className="w-64 shrink-0 border-l border-border bg-surface flex flex-col">
          <div className="flex shrink-0 border-b border-border">
            <button
              onClick={() => setRightTab("properties")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                rightTab === "properties"
                  ? "text-accent border-b-2 border-accent"
                  : "text-muted hover:text-text"
              }`}
            >
              {t.layers.propertiesTab}
            </button>
            <button
              onClick={() => setRightTab("layers")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                rightTab === "layers"
                  ? "text-accent border-b-2 border-accent"
                  : "text-muted hover:text-text"
              }`}
            >
              {t.layers.layersTab}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {rightTab === "properties" ? <PropertiesPanel /> : <LayersPanel />}
          </div>
        </aside>
      </div>

      {/* Output panel */}
      <div
        className="shrink-0 border-t border-border flex flex-col bg-surface"
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
    </div>
  );
}
