import { ObjectRegistry, PALETTE_GROUPS } from '../../registry';
import { useT } from '../../lib/useT';
import { DragHandleIcon } from '../ui/DragHandleIcon';

export function ObjectPalette() {
  const t = useT();
  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('objectType', type);
    // Encode the type into the MIME key so it's readable during dragover
    // (dataTransfer.getData() is blocked during dragover by the spec)
    e.dataTransfer.setData(`application/x-zpl-type+${type}`, type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="p-3 flex flex-col gap-3">
      {PALETTE_GROUPS.map((group) => {
        const entries = Object.entries(ObjectRegistry).filter(
          ([, def]) => def.group === group.key,
        );
        if (entries.length === 0) return null;
        return (
          <div key={group.key} className="flex flex-col gap-0.5">
            <p className="font-mono text-[10px] font-medium text-muted uppercase tracking-widest px-1 pt-1 pb-1.5">
              {t.palette[group.labelKey]}
            </p>
            {entries.map(([type, def]) => (
              <div
                key={type}
                draggable
                onDragStart={(e) => handleDragStart(e, type)}
                className="
                  group flex items-center gap-2.5 px-2 py-2 rounded
                  border border-transparent
                  hover:border-border-2 hover:bg-surface-2
                  cursor-grab active:cursor-grabbing select-none
                  transition-colors
                "
              >
                <DragHandleIcon className="w-2 h-3.5 shrink-0 text-muted opacity-0 group-hover:opacity-60 transition-opacity" />
                <span className="font-mono text-[11px] text-accent w-6 text-center shrink-0">
                  {def.icon}
                </span>
                <span className="text-xs text-text">
                  {(t.types as Record<string, string>)[type] ?? def.label}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
