import { ObjectRegistry } from '../../registry';
import t from '../../locales/en';

export function ObjectPalette() {
  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('objectType', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="p-3 flex flex-col gap-1">
      <p className="font-mono text-[10px] font-medium text-muted uppercase tracking-widest px-1 pt-1 pb-2">
        {t.palette.heading}
      </p>
      {Object.entries(ObjectRegistry).map(([type, def]) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => handleDragStart(e, type)}
          className="
            group flex items-center gap-2.5 px-2.5 py-2 rounded
            border border-transparent
            hover:border-border-2 hover:bg-surface-2
            cursor-grab active:cursor-grabbing select-none
            transition-colors
          "
        >
          <span className="font-mono text-[11px] text-accent w-6 text-center shrink-0 group-hover:text-accent">
            {def.icon}
          </span>
          <span className="text-xs text-text">
            {def.label}
          </span>
        </div>
      ))}
    </div>
  );
}
