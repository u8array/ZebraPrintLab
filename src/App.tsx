import { useState } from 'react';
import { ObjectPalette } from './components/Palette/ObjectPalette';
import { LabelCanvas } from './components/Canvas/LabelCanvas';
import { PropertiesPanel } from './components/Properties/PropertiesPanel';
import { ZPLOutput } from './components/Output/ZPLOutput';
import { LabelPreview } from './components/Output/LabelPreview';
import { useLabelStore, useHistory } from './store/labelStore';
import { generateZPL } from './lib/zplGenerator';
import { fetchPreview } from './lib/labelary';

function App() {
  const label = useLabelStore((s) => s.label);
  const objects = useLabelStore((s) => s.objects);
  const selectObject = useLabelStore((s) => s.selectObject);
  const { undo, redo, pastStates, futureStates } = useHistory();
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);

  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;
  const hasObjects = objects.length > 0;

  const handleDownload = () => {
    const zpl = generateZPL(label, objects);
    const blob = new Blob([zpl], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'label.zpl';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handlePrint = async () => {
    const zpl = generateZPL(label, objects);
    const url = await fetchPreview(zpl, label);
    const win = window.open('', '_blank');
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
          <ToggleButton
            active={showGrid}
            onClick={() => setShowGrid((v) => !v)}
            title="Grid (G)"
          >
            Grid
          </ToggleButton>
          <ToggleButton
            active={snapEnabled}
            onClick={() => setSnapEnabled((v) => !v)}
            title="Snap to mm"
          >
            Snap
          </ToggleButton>

          <div className="w-px h-4 bg-border mx-1" />

          <button
            onClick={() => undo()}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            className="px-2.5 py-1 rounded text-xs font-mono text-muted hover:text-text hover:bg-surface-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            ↩ Undo
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo}
            title="Redo (⌘⇧Z)"
            className="px-2.5 py-1 rounded text-xs font-mono text-muted hover:text-text hover:bg-surface-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            Redo ↪
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          <button
            onClick={handleDownload}
            disabled={!hasObjects}
            title="Download ZPL"
            className="px-2.5 py-1 rounded text-xs font-mono text-muted hover:text-text hover:bg-surface-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            ↓ ZPL
          </button>
          <button
            onClick={handlePrint}
            disabled={!hasObjects}
            title="Print preview"
            className="px-2.5 py-1 rounded text-xs font-mono text-muted hover:text-text hover:bg-surface-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            ⎙ Print
          </button>
        </div>
      </header>

      {/* Main area: 3 columns */}
      <div className="flex flex-1 min-h-0">

        <aside className="w-44 shrink-0 border-r border-border bg-surface overflow-y-auto">
          <ObjectPalette />
        </aside>

        <main className="flex-1 overflow-hidden">
          <LabelCanvas showGrid={showGrid} snapEnabled={snapEnabled} />
        </main>

        <aside className="w-64 shrink-0 border-l border-border bg-surface overflow-y-auto">
          <PropertiesPanel />
        </aside>

      </div>

      {/* Output panel */}
      <div className="h-52 shrink-0 border-t border-border flex bg-surface">
        <div className="flex-1 border-r border-border overflow-auto">
          <ZPLOutput />
        </div>
        <div className="w-56 shrink-0 overflow-hidden">
          <LabelPreview />
        </div>
      </div>

    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
        active
          ? 'text-accent bg-[--color-accent-dim] hover:bg-[--color-accent-dim]'
          : 'text-muted hover:text-text hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}

export default App;
