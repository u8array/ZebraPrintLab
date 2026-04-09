import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/16/solid';
import type { ComponentType, SVGProps } from 'react';

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

// ── Public API ────────────────────────────────────────────────────────────────

interface MenuItemProps {
  onClick?: () => void;
  disabled?: boolean;
  shortcut?: string;
  icon?: HeroIcon;
  children: React.ReactNode;
}

interface MenuProps {
  label: React.ReactNode;
  children: React.ReactNode;
  maxHeight?: string;
}

// ── Components ────────────────────────────────────────────────────────────────

export function DropdownSeparator() {
  return <div className="my-1 border-t border-border" />;
}

export function DropdownItem({ onClick, disabled, shortcut, icon: Icon, children }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-text hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
    >
      {Icon && <Icon className="w-3.5 h-3.5 text-muted shrink-0" />}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-muted text-[10px]">{shortcut}</span>}
    </button>
  );
}

export function DropdownMenu({ label, children, maxHeight }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono transition-colors ${
          open
            ? 'text-accent bg-[--color-accent-dim]'
            : 'text-muted hover:text-text hover:bg-surface-2'
        }`}
      >
        {label}
        <ChevronDownIcon className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-[190px] bg-surface border border-border rounded-lg shadow-2xl p-1 overflow-y-auto"
          style={maxHeight ? { maxHeight } : undefined}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
