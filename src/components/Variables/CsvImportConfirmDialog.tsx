import { DialogShell } from '../ui/DialogShell';
import { useT } from '../../hooks/useT';
import type { PendingImport } from '../../hooks/useCsvImportActions';

interface Props {
  pending: PendingImport;
  onConfirm: (opts: { keepMapping: boolean }) => void;
  onCancel: () => void;
}

/** Three-state confirmation surfaced from `useCsvImportActions` when
 *  the user picks a new CSV while one is already loaded.
 *  - `same` (compatible) → single Replace (mapping carries over).
 *  - `different` (incompatible) → Discard mapping / Keep & remap.
 *  Cancel always closes without touching state. Custom inline buttons
 *  instead of the shared ConfirmDialog because that component only
 *  supports a single confirm action. */
export function CsvImportConfirmDialog({ pending, onConfirm, onCancel }: Props) {
  const tv = useT().variables;
  const newFilename = pending.parsed.file.name;
  const oldFilename = pending.replacingFilename ?? '';
  const headline = tv.csvReplaceCsvBodyFmt
    .replace('{old}', oldFilename)
    .replace('{new}', newFilename);
  const detail =
    pending.kind === 'same'
      ? pending.wasHeaderless
        ? tv.csvReplaceCsvSameColumnsFmt.replace(
            '{n}',
            String(pending.previousColumnCount),
          )
        : tv.csvReplaceCsvSameHeaders
      : pending.wasHeaderless
        ? tv.csvReplaceCsvDifferentColumnsFmt.replace(
            '{n}',
            String(pending.previousColumnCount),
          )
        : tv.csvReplaceCsvDifferentHeaders;

  return (
    <DialogShell
      onClose={onCancel}
      role="alertdialog"
      describedBy="csv-import-confirm-message"
      portal
      boxClassName="bg-surface border border-border rounded shadow-lg flex flex-col w-[440px] max-w-[95vw]"
    >
      <div className="px-5 py-5 flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          {tv.csvReplaceCsvTitle}
        </p>
        <p
          id="csv-import-confirm-message"
          className="text-xs text-text leading-relaxed"
        >
          {headline}
        </p>
        <p className="text-[11px] text-muted leading-relaxed">{detail}</p>
      </div>
      <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded text-xs font-mono whitespace-nowrap border border-border text-text hover:bg-surface-2 transition-colors"
        >
          {tv.cancel}
        </button>
        {pending.kind === 'same' ? (
          <button
            type="button"
            autoFocus
            onClick={() => onConfirm({ keepMapping: true })}
            className="px-4 py-1.5 rounded text-xs font-mono whitespace-nowrap bg-accent text-bg hover:opacity-90 transition"
          >
            {tv.csvReplaceAction}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onConfirm({ keepMapping: false })}
              className="px-4 py-1.5 rounded text-xs font-mono whitespace-nowrap border border-border text-text hover:bg-surface-2 transition-colors"
            >
              {tv.csvDiscardMapping}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => onConfirm({ keepMapping: true })}
              className="px-4 py-1.5 rounded text-xs font-mono whitespace-nowrap bg-accent text-bg hover:opacity-90 transition"
            >
              {tv.csvKeepAndRemap}
            </button>
          </>
        )}
      </div>
    </DialogShell>
  );
}
