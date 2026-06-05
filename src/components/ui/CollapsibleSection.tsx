import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from '@heroicons/react/16/solid';

interface CollapsibleSectionProps {
  /** Stable identifier, used as the localStorage key for the open state. */
  id: string;
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

const LS_PREFIX = 'zpl:section:';

function readStored(id: string, fallback: boolean): boolean {
  const saved = localStorage.getItem(LS_PREFIX + id);
  return saved === null ? fallback : saved === '1';
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
  const [open, setOpen] = useState(() => readStored(id, defaultOpen));

  // Re-sync open state when `id` changes so the component can be reused for
  // a different section without leaking the previous open state into the new
  // id's storage slot. React's blessed pattern for deriving state from
  // props: setState during render under a prev-vs-current guard.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setOpen(readStored(id, defaultOpen));
  }

  useEffect(() => {
    localStorage.setItem(LS_PREFIX + id, open ? '1' : '0');
  }, [id, open]);

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
