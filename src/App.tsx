import { useEffect, useRef, useState } from "react";
import { ObjectPalette } from "./components/Palette/ObjectPalette";
import { LabelCanvas } from "./components/Canvas/LabelCanvas";
import { PropertiesPanel } from "./components/Properties/PropertiesPanel";
import { LayersPanel } from "./components/Properties/LayersPanel";
import { ZPLOutput } from "./components/Output/ZPLOutput";
import { ZplImportModal } from "./components/Output/ZplImportModal";
import {
  DropdownMenu,
  DropdownItem,
  DropdownSeparator,
} from "./components/ui/DropdownMenu";
import { GitHubIcon } from "./components/ui/GitHubIcon";
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
} from "@heroicons/react/16/solid";
import { useLabelStore, useHistory } from "./store/labelStore";
import { localeNames } from "./locales";
import type { LocaleCode } from "./locales";
import { generateZPL } from "./lib/zplGenerator";
import { parseZPL } from "./lib/zplParser";
import { fetchPreview } from "./lib/labelary";
import type { LabelConfig } from "./types/ObjectType";
import type { LabelObject } from "./registry";
import { useT } from "./lib/useT";

const OUTPUT_MIN_H = 80;
const OUTPUT_MAX_H = 600;
const OUTPUT_DEFAULT_H = 208; // h-52 = 13rem = 208px

function useResizablePanel(defaultH: number) {
  const [height, setHeight] = useState(defaultH);
  const [collapsed, setCollapsed] = useState(false);
  const prevHeightRef = useRef(defaultH);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      startY: e.clientY,
      startH: collapsed ? OUTPUT_MIN_H : height,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      const next = Math.min(
        OUTPUT_MAX_H,
        Math.max(OUTPUT_MIN_H, dragRef.current.startH + delta),
      );
      if (next <= OUTPUT_MIN_H) {
        setCollapsed(true);
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        return;
      }
      setCollapsed(false);
      setHeight(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const collapse = () => {
    prevHeightRef.current = height;
    setCollapsed(true);
  };
  const expand = () => {
    setHeight(OUTPUT_DEFAULT_H);
    setCollapsed(false);
  };

  return { height, collapsed, onMouseDown, collapse, expand };
}

function triggerDownload(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function App() {
  const t = useT();
  const label = useLabelStore((s) => s.label);
  const objects = useLabelStore((s) => s.objects);
  const selectObject = useLabelStore((s) => s.selectObject);
  const duplicateSelectedObjects = useLabelStore(
    (s) => s.duplicateSelectedObjects,
  );
  const copySelectedObjects = useLabelStore((s) => s.copySelectedObjects);
  const pasteObjects = useLabelStore((s) => s.pasteObjects);
  const loadDesign = useLabelStore((s) => s.loadDesign);
  const locale = useLabelStore((s) => s.locale);
  const setLocale = useLabelStore((s) => s.setLocale);
  const { undo, redo, pastStates, futureStates } = useHistory();
  const canvasSettings = useLabelStore((s) => s.canvasSettings);
  const setCanvasSettings = useLabelStore((s) => s.setCanvasSettings);
  const { showGrid, snapEnabled, snapSizeMm } = canvasSettings;
  const [showZplImport, setShowZplImport] = useState(false);
  const outputPanel = useResizablePanel(OUTPUT_DEFAULT_H);
  const [rightTab, setRightTab] = useState<"properties" | "layers">(
    "properties",
  );
  const loadInputRef = useRef<HTMLInputElement>(null);
  const zplFileInputRef = useRef<HTMLInputElement>(null);

  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;
  const hasObjects = objects.length > 0;

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.code === "KeyD") {
        e.preventDefault();
        duplicateSelectedObjects();
        return;
      }
      if (mod && e.code === "KeyC") {
        e.preventDefault();
        copySelectedObjects();
        return;
      }
      if (mod && e.code === "KeyV") {
        e.preventDefault();
        pasteObjects();
        return;
      }
      if (inInput) return;
      if (e.code === "KeyG") {
        e.preventDefault();
        setCanvasSettings({
          showGrid: !useLabelStore.getState().canvasSettings.showGrid,
        });
      }
      if (e.code === "KeyS") {
        e.preventDefault();
        setCanvasSettings({
          snapEnabled: !useLabelStore.getState().canvasSettings.snapEnabled,
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    undo,
    redo,
    duplicateSelectedObjects,
    copySelectedObjects,
    pasteObjects,
    setCanvasSettings,
  ]);

  const handleNew = () => {
    loadDesign({ widthMm: 100, heightMm: 60, dpmm: 8 }, []);
  };

  const handleSave = () => {
    const data = JSON.stringify({ label, objects }, null, 2);
    triggerDownload(
      new Blob([data], { type: "application/json" }),
      "label.json",
    );
  };

  const handleLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string) as {
          label: LabelConfig;
          objects: LabelObject[];
        };
        if (json.label && Array.isArray(json.objects)) {
          loadDesign(json.label, json.objects);
        }
      } catch {
        // invalid file — silently ignore
      }
    };
    reader.readAsText(file);
    // reset so same file can be loaded again
    e.target.value = "";
  };

  const handleZplFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const zpl = ev.target?.result as string;
      if (!zpl?.trim()) return;
      const { labelConfig, objects } = parseZPL(zpl, label.dpmm);
      loadDesign({ ...label, ...labelConfig }, objects);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleDownload = () => {
    const zpl = generateZPL(label, objects);
    triggerDownload(new Blob([zpl], { type: "text/plain" }), "label.zpl");
  };

  const handlePrint = async () => {
    const zpl = generateZPL(label, objects);
    const url = await fetchPreview(zpl, label);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><style>
        body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
        img { max-width: 100%; max-height: 100%; }
        @media print { body { height: auto; } }
      </style></head>
      <body><img src="${url}" onload="window.print();window.close();" /></body>
      </html>
    `);
    win.document.close();
    URL.revokeObjectURL(url);
  };

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
            {label.widthMm} × {label.heightMm} mm · {label.dpmm} dpmm
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
            <DropdownItem
              icon={ArrowUpTrayIcon}
              onClick={() => setShowZplImport(true)}
            >
              {t.app.importZpl}
            </DropdownItem>
            <DropdownItem
              icon={ArrowUpTrayIcon}
              onClick={() => zplFileInputRef.current?.click()}
            >
              {t.app.importZplFile}
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
          <input
            ref={zplFileInputRef}
            type="file"
            accept=".zpl,text/plain"
            className="hidden"
            onChange={handleZplFileLoad}
          />
        </div>
      </header>

      {/* Main area: 3 columns */}
      <div className="flex flex-1 min-h-0">
        <aside className="w-44 shrink-0 border-r border-border bg-surface overflow-y-auto">
          <ObjectPalette />
        </aside>

        <main className="flex-1 overflow-hidden">
          <LabelCanvas
            showGrid={showGrid}
            onGridToggle={() => setCanvasSettings({ showGrid: !showGrid })}
            snapEnabled={snapEnabled}
            onSnapToggle={() =>
              setCanvasSettings({ snapEnabled: !snapEnabled })
            }
            snapSizeMm={snapSizeMm}
            onSnapSizeChange={(v) => setCanvasSettings({ snapSizeMm: v })}
            zoom={canvasSettings.zoom}
            onZoomChange={(v) => setCanvasSettings({ zoom: v })}
          />
        </main>

        <aside className="w-64 shrink-0 border-l border-border bg-surface flex flex-col">
          {/* Tab bar */}
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

      {showZplImport && (
        <ZplImportModal onClose={() => setShowZplImport(false)} />
      )}
    </div>
  );
}

export default App;
