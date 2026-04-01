import { ObjectPalette } from './components/Palette/ObjectPalette';
import { LabelCanvas } from './components/Canvas/LabelCanvas';
import { PropertiesPanel } from './components/Properties/PropertiesPanel';
import { ZPLOutput } from './components/Output/ZPLOutput';
import { LabelPreview } from './components/Output/LabelPreview';

function App() {
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Hauptbereich: 3 Spalten */}
      <div className="flex flex-1 min-h-0">
        {/* Palette */}
        <aside className="w-48 shrink-0 border-r border-gray-800 overflow-y-auto">
          <ObjectPalette />
        </aside>

        {/* Canvas */}
        <main className="flex-1 overflow-hidden">
          <LabelCanvas />
        </main>

        {/* Properties */}
        <aside className="w-64 shrink-0 border-l border-gray-800 overflow-y-auto">
          <PropertiesPanel />
        </aside>
      </div>

      {/* Output-Panel */}
      <div className="h-56 shrink-0 border-t border-gray-800 flex">
        <div className="flex-1 border-r border-gray-800 overflow-auto">
          <ZPLOutput />
        </div>
        <div className="w-64 shrink-0 overflow-hidden">
          <LabelPreview />
        </div>
      </div>
    </div>
  );
}

export default App;
