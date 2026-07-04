import { useId, type ReactNode } from "react";
import { DialogShell } from "../ui/DialogShell";
import { DialogHeader } from "../ui/DialogHeader";
import { DialogActions } from "../ui/DialogActions";

/** Shared chrome (DialogShell + header + scroll body + footer) for the
 *  single-column content builder modal. The GS1 builder composes DialogShell
 *  directly because its two-pane layout diverges from this frame. */
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
      <DialogHeader
        titleId={titleId}
        subtitleId={subtitleId}
        title={title}
        subtitle={subtitle}
        onClose={onClose}
        closeLabel={closeLabel}
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">{children}</div>

      <footer className="px-5 py-3 border-t border-border">
        <DialogActions
          onCancel={onClose}
          onApply={onApply}
          applyDisabled={applyDisabled}
          applyLabel={applyLabel}
          cancelLabel={cancelLabel}
        />
      </footer>
    </DialogShell>
  );
}
