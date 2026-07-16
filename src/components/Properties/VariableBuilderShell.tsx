import { useId, type ReactNode } from "react";
import { XMarkIcon, CheckIcon } from "@heroicons/react/16/solid";
import { DialogShell } from "../ui/DialogShell";

/** Dedicated chrome for the Variable-Builder modal (712px, scrolling body,
 *  footer with a left token-summary slot). Separate from the shared
 *  BarcodeContentModalShell so the GS1/QR builders keep their 640px layout.
 *  The modal edits live (content writes straight through, variables are
 *  global), so there is no Apply/Cancel: a single Done button closes, and
 *  reverts go through global undo. */
export function VariableBuilderShell({
  title,
  subtitle,
  onClose,
  doneLabel,
  closeLabel,
  footerSummary,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  doneLabel: string;
  closeLabel: string;
  footerSummary: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const subtitleId = useId();
  return (
    <DialogShell
      portal
      labelledBy={titleId}
      describedBy={subtitleId}
      onClose={onClose}
      boxClassName="bg-surface border border-border rounded-[10px] shadow-2xl w-[712px] max-w-[95vw] max-h-[680px] flex flex-col overflow-hidden"
    >
      <header className="px-[18px] py-3.5 border-b border-border flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 id={titleId} className="text-[13px] font-semibold text-text">{title}</h2>
          <p id={subtitleId} className="text-[11px] text-muted">{subtitle}</p>
        </div>
        <button type="button" aria-label={closeLabel} onClick={onClose} className="text-muted hover:text-text">
          <XMarkIcon className="w-[15px] h-[15px]" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-[18px] py-4 flex flex-col gap-4">{children}</div>

      <footer className="px-[18px] py-[11px] border-t border-border flex items-center justify-between gap-4">
        <div className="text-[10.5px] text-muted min-w-0 truncate">{footerSummary}</div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold bg-accent text-bg hover:opacity-90 shrink-0"
        >
          <CheckIcon className="w-3.5 h-3.5" />
          {doneLabel}
        </button>
      </footer>
    </DialogShell>
  );
}
