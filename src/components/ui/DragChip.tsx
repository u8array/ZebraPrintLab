import type { ReactNode } from 'react';

/** Compact icon + label chip shown under the cursor in a DragOverlay. Shared by
 *  the object palette (drag-to-canvas and favorites reorder) and the layers tree
 *  so every drag preview looks the same. `count` adds a `+N` badge for a block. */
export function DragChip({ icon, label, count }: { icon: ReactNode; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-bg border border-accent px-3 py-1.5 shadow-[0_10px_26px_rgba(0,0,0,.5)]">
      <span className="font-mono text-xs text-accent">{icon}</span>
      <span className="text-xs font-medium text-text">{label}</span>
      {count ? <span className="font-mono text-[10px] text-accent">+{count}</span> : null}
    </div>
  );
}
