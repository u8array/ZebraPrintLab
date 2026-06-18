import { type ReactNode } from 'react';
import { ChevronDownIcon } from '@heroicons/react/16/solid';
import { useCollapsibleState } from './useCollapsibleState';

interface CollapsibleSectionProps {
  /** Stable identifier, used as the localStorage key for the open state. */
  id: string;
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Section with a clickable header that toggles its body. Independent of
 * sibling sections; multiple can be open at once. Open state is persisted
 * per `id` in localStorage so the UI feels stable across reloads.
 */
export function CollapsibleSection({
  id,
  title,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useCollapsibleState(id, defaultOpen);

  const contentId = `section-content-${id}`;

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex items-center justify-between gap-2 px-1 pt-1 pb-1.5 text-muted hover:text-text transition-colors"
      >
        <span className="font-mono text-[10px] font-medium uppercase tracking-widest">
          {title}
        </span>
        <ChevronDownIcon
          className={`w-3 h-3 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <div id={contentId} className="flex flex-col gap-0.5">
          {children}
        </div>
      )}
    </div>
  );
}
