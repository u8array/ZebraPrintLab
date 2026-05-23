import { DialogShell } from '../ui/DialogShell';
import type { PendingImport } from '../../hooks/useCsvImportActions';

interface Props {
  pending: PendingImport;
  onConfirm: (opts: { keepMapping: boolean }) => void;
  onCancel: () => void;
}

/* i18n: Phase-2 strings here get locale keys at end-of-branch sweep. */
const COPY = {
  title: 'Replace CSV data',
  // {old} replaced by old filename, {new} by new filename.
  bodyReplacePrefixFmt: 'Replace "{old}" with "{new}"?',
  // Filled when headers/columns line up (mapping carries over).
  bodySameHeaders: 'Same column names. Mapping stays intact.',
  bodySameColumnsHeaderlessFmt:
    'Same column count ({n}). Mapping stays intact.',
  // Filled when headers/columns diverge (mapping needs review).
  bodyDifferentHeaders:
    'The new file has different column names. The current mapping will not match cleanly.',
  bodyDifferentColumnsHeaderlessFmt:
    'The new file has a different column count (was {n}). The current mapping will not match cleanly.',
  cancel: 'Cancel',
  replace: 'Replace',
  discardMapping: 'Discard mapping',
  keepAndRemap: 'Keep & remap',
} as const;

/** Three-state confirmation surfaced from `useCsvImportActions` when
 *  the user picks a new CSV while one is already loaded.
 *  - `same` (compatible) → single Replace (mapping carries over).
 *  - `different` (incompatible) → Discard mapping / Keep & remap.
 *  Cancel always closes without touching state. Custom inline buttons
 *  instead of the shared ConfirmDialog because that component only
 *  supports a single confirm action. */
export function CsvImportConfirmDialog({ pending, onConfirm, onCancel }: Props) {
  const newFilename = pending.parsed.file.name;
  const oldFilename = pending.replacingFilename ?? '';
  const headline = COPY.bodyReplacePrefixFmt
    .replace('{old}', oldFilename)
    .replace('{new}', newFilename);
  const detail =
    pending.kind === 'same'
      ? pending.wasHeaderless
        ? COPY.bodySameColumnsHeaderlessFmt.replace(
            '{n}',
            String(pending.previousColumnCount),
          )
        : COPY.bodySameHeaders
      : pending.wasHeaderless
        ? COPY.bodyDifferentColumnsHeaderlessFmt.replace(
            '{n}',
            String(pending.previousColumnCount),
          )
        : COPY.bodyDifferentHeaders;

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
          {COPY.title}
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
          {COPY.cancel}
        </button>
        {pending.kind === 'same' ? (
          <button
            type="button"
            autoFocus
            onClick={() => onConfirm({ keepMapping: true })}
            className="px-4 py-1.5 rounded text-xs font-mono whitespace-nowrap bg-accent text-bg hover:opacity-90 transition"
          >
            {COPY.replace}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onConfirm({ keepMapping: false })}
              className="px-4 py-1.5 rounded text-xs font-mono whitespace-nowrap border border-border text-text hover:bg-surface-2 transition-colors"
            >
              {COPY.discardMapping}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => onConfirm({ keepMapping: true })}
              className="px-4 py-1.5 rounded text-xs font-mono whitespace-nowrap bg-accent text-bg hover:opacity-90 transition"
            >
              {COPY.keepAndRemap}
            </button>
          </>
        )}
      </div>
    </DialogShell>
  );
}
