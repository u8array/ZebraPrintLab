import { ObjectRegistry } from '../../registry';

export function ObjectPalette() {
  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('objectType', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="p-3 flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
        Objekte
      </p>
      {Object.entries(ObjectRegistry).map(([type, def]) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => handleDragStart(e, type)}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-800 hover:bg-gray-700 cursor-grab active:cursor-grabbing select-none text-sm text-gray-200"
        >
          <span className="font-mono text-gray-400 w-6 text-center shrink-0">
            {def.icon}
          </span>
          {def.label}
        </div>
      ))}
    </div>
  );
}
