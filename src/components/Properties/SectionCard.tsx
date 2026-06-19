import { useId, type ReactNode } from 'react';
import { ChevronDownIcon } from '@heroicons/react/16/solid';
import { useCollapsibleState } from '../ui/useCollapsibleState';
import { ZplCmd } from './ZplCmd';

const titleCls =
  'font-mono text-[10px] font-semibold uppercase tracking-widest text-text';

/** Status dot: accent when the section is open/active, muted otherwise. */
function Dot({ active }: { active: boolean }) {
  return (
    <span
      className={`w-1.5 h-1.5 rounded-sm shrink-0 ${active ? 'bg-accent' : 'bg-border-2'}`}
    />
  );
}

/** Dot + title, shared by all three card header variants. `titleId` lets a
 *  control (e.g. the toggle switch) reference the title as its accessible name. */
function CardLabel({
  active,
  title,
  titleId,
}: {
  active: boolean;
  title: ReactNode;
  titleId?: string;
}) {
  return (
    <>
      <Dot active={active} />
      <span id={titleId} className={titleCls}>
        {title}
      </span>
    </>
  );
}

// bg-surface on a same-coloured panel: the border carries the edge in dark,
// the shadow lifts the card in light (panel stays bg-surface, not bg-bg, so it
// keeps a clear border against the canvas).
const cardCls = 'rounded-lg border border-border bg-surface shadow-sm overflow-hidden';
const bodyCls = 'px-2.5 pb-3 pt-0.5 flex flex-col gap-3';

interface SectionCardProps {
  /** Stable id; persists open-state under the shared `zpl:section:` keys. */
  id: string;
  title: ReactNode;
  defaultOpen?: boolean;
  /** ZPL command this single-command section maps to (e.g. ^FN); shown when
   *  showZplCommands is on. Omit for multi-command sections. */
  cmd?: string;
  children: ReactNode;
}

/**
 * Collapsible properties section as a self-contained card. Renders its own
 * card chrome (dot + title + chevron) for the Properties panel and reuses
 * CollapsibleSection's persistence via `useCollapsibleState`, so the open
 * state survives regardless of which renderer drew the section.
 */
export function SectionCard({
  id,
  title,
  defaultOpen = true,
  cmd,
  children,
}: SectionCardProps) {
  const [open, setOpen] = useCollapsibleState(id, defaultOpen);
  const contentId = useId();
  return (
    <div className={cardCls}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex items-center gap-2 w-full px-2.5 py-2.5 text-left"
      >
        <CardLabel active={open} title={title} />
        <span className="ml-auto flex items-center gap-2">
          <ZplCmd cmd={cmd} />
          <ChevronDownIcon
            className={`w-3 h-3 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
          />
        </span>
      </button>
      {open && (
        <div id={contentId} className={bodyCls}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Always-open card (no collapse control), for the lead "Content" section
 * that should never be hidden. Shares the card chrome with SectionCard.
 */
export function StaticSectionCard({
  title,
  cmd,
  children,
}: {
  title: ReactNode;
  /** ZPL command this single-field section emits (e.g. ^FD); shown as a tag
   *  when showZplCommands is on. Only for sections that map to one command. */
  cmd?: string;
  children: ReactNode;
}) {
  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2 px-2.5 py-2.5">
        <CardLabel active title={title} />
        <div className="ml-auto">
          <ZplCmd cmd={cmd} />
        </div>
      </div>
      <div className={bodyCls}>{children}</div>
    </div>
  );
}

/**
 * Card whose header switch toggles a feature on/off (e.g. ^FB field block).
 * The switch is the section's enable control, so the body shows only while
 * on; there is no separate collapse and no persisted open-state (the toggled
 * feature itself is the source of truth).
 */
export function ToggleSectionCard({
  title,
  cmd,
  checked,
  onCheckedChange,
  children,
}: {
  title: ReactNode;
  /** ZPL command this toggle controls (e.g. ^FB); shown when showZplCommands is on. */
  cmd?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  const contentId = useId();
  const titleId = useId();
  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2 px-2.5 py-2.5">
        <CardLabel active={checked} title={title} titleId={titleId} />
        <div className="ml-auto flex items-center gap-2">
          <ZplCmd cmd={cmd} />
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-labelledby={titleId}
            aria-controls={checked ? contentId : undefined}
            onClick={() => onCheckedChange(!checked)}
            className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-border-2'}`}
          >
            <span
              className={`inline-block h-3 w-3 rounded-full bg-surface transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>
      </div>
      {checked && (
        <div id={contentId} className={bodyCls}>
          {children}
        </div>
      )}
    </div>
  );
}
