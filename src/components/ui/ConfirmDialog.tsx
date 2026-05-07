import { useEffect } from 'react';
import { createPortal } from 'react-dom';

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
 * visibility state. Backdrop click and Escape both fire `onCancel`.
 */
export function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    // Lock background scroll while the modal is open so the dialog stays
    // visually anchored and the user cannot drift past it.
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = originalOverflow;
    };
  }, [onCancel]);

  const confirmCls = destructive
    ? 'bg-red-500 text-white hover:bg-red-600'
    : 'bg-accent text-bg hover:opacity-90';

  // Portal so the fixed-position backdrop is anchored to the viewport even
  // when an ancestor has a CSS transform (which would otherwise contain
  // `position: fixed` and miscentre the modal).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-describedby="confirm-dialog-message"
        className="bg-surface border border-border rounded shadow-lg flex flex-col w-[400px] max-w-[95vw]"
        onClick={(e) => e.stopPropagation()}
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
      </div>
    </div>,
    document.body,
  );
}
