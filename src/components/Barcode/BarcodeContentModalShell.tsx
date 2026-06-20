import { useId, type ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { DialogShell } from "../ui/DialogShell";

/** Shared chrome (DialogShell + header + scroll body + footer) for the GS1/QR
 *  builder modals, so the siblings stay identical. */
export function BarcodeContentModalShell({
  title,
  subtitle,
  onClose,
  onApply,
  applyDisabled,
  applyLabel,
  cancelLabel,
  closeLabel,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  onApply: () => void;
  applyDisabled: boolean;
  applyLabel: string;
  cancelLabel: string;
  closeLabel: string;
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
      boxClassName="bg-surface border border-border rounded-lg shadow-2xl w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden"
    >
      <header className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 id={titleId} className="text-sm font-medium text-text">{title}</h2>
          <p id={subtitleId} className="text-[11px] text-muted">{subtitle}</p>
        </div>
        <button type="button" aria-label={closeLabel} onClick={onClose} className="text-muted hover:text-text">
          <XMarkIcon className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">{children}</div>

      <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded text-xs text-text hover:bg-surface-2">
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={applyDisabled}
          className="px-3 py-1.5 rounded text-xs bg-accent text-bg disabled:opacity-40 disabled:pointer-events-none"
        >
          {applyLabel}
        </button>
      </footer>
    </DialogShell>
  );
}
