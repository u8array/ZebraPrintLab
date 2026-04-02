import { ObjectPalette } from './components/Palette/ObjectPalette';
import { LabelCanvas } from './components/Canvas/LabelCanvas';
import { PropertiesPanel } from './components/Properties/PropertiesPanel';
import { ZPLOutput } from './components/Output/ZPLOutput';
import { LabelPreview } from './components/Output/LabelPreview';
import { useLabelStore, useHistory } from './store/labelStore';

function App() {
  const label = useLabelStore((s) => s.label);
  const { undo, redo, pastStates, futureStates } = useHistory();

  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg text-text font-sans">

      {/* Header */}
      <header className="h-11 shrink-0 flex items-center justify-between px-4 border-b border-border bg-surface">
        <div className="flex items-center gap-3">
          <span className="text-accent font-semibold tracking-tight text-sm">
            ZPL Designer
          </span>
          <span className="text-border-2 select-none">·</span>
          <span className="font-mono text-xs text-muted">
            {label.widthMm} × {label.heightMm} mm · {label.dpmm} dpmm
          </span>
        </div>

        <div className="flex items-center gap-1">
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
        </div>
      </header>

      {/* Hauptbereich: 3 Spalten */}
      <div className="flex flex-1 min-h-0">

        {/* Palette */}
        <aside className="w-44 shrink-0 border-r border-border bg-surface overflow-y-auto">
          <ObjectPalette />
        </aside>

        {/* Canvas */}
        <main className="flex-1 overflow-hidden">
          <LabelCanvas />
        </main>

        {/* Properties */}
        <aside className="w-64 shrink-0 border-l border-border bg-surface overflow-y-auto">
          <PropertiesPanel />
        </aside>

      </div>

      {/* Output-Panel */}
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

export default App;
