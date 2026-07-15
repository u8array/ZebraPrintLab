import { DialogShell } from './DialogShell';

interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Renders the confirm button in red. Use for irreversible operations. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Minimal confirm dialog matching the project's modal aesthetic.
 *
 * Mount it conditionally (`{open && <ConfirmDialog … />}`); the parent owns
 * visibility state. Escape fires `onCancel`.
 */
export function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmCls = destructive
    ? 'bg-red-500 text-white hover:bg-red-600'
    : 'bg-accent text-bg hover:opacity-90';

  return (
    <DialogShell
      onClose={onCancel}
      role="alertdialog"
      describedBy="confirm-dialog-message"
      portal
      boxClassName="bg-surface border border-border rounded shadow-lg flex flex-col w-[400px] max-w-[95vw]"
    >
      <p
        id="confirm-dialog-message"
        className="px-5 py-5 text-xs text-text leading-relaxed"
      >
        {message}
      </p>
      <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          autoFocus={destructive}
          className="px-4 py-1.5 rounded text-xs font-mono whitespace-nowrap border border-border text-text hover:bg-surface-2 transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          autoFocus={!destructive}
          className={`px-4 py-1.5 rounded text-xs font-mono whitespace-nowrap ${confirmCls} transition`}
        >
          {confirmLabel}
        </button>
      </div>
    </DialogShell>
  );
}
