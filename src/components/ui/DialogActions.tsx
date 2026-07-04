/** Cancel + primary-action button pair for a dialog footer. Shared so the
 *  builder modals share one styling; a consumer that needs a status line puts
 *  it beside this in its own footer. */
export function DialogActions({
  onCancel,
  onApply,
  applyDisabled,
  applyLabel,
  cancelLabel,
}: {
  onCancel: () => void;
  onApply: () => void;
  applyDisabled: boolean;
  applyLabel: string;
  cancelLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 shrink-0">
      <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded text-xs text-text hover:bg-surface-2">
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
    </div>
  );
}
