import { useState } from 'react';
import { ArrowUpTrayIcon, XMarkIcon } from '@heroicons/react/16/solid';
import { useT } from '../../hooks/useT';
import { DialogShell } from '../ui/DialogShell';
import { Select } from '../ui/Select';
import type { PendingExcelImport } from '../../hooks/useExcelImportActions';

interface Props {
  pending: PendingExcelImport;
  onLoad: (sheet: string) => Promise<boolean>;
  onCancel: () => void;
}

/** Worksheet picker between file pick and dataset commit. Always shown so a
 *  dataset replace takes a deliberate Load click (parity with the CSV
 *  confirm and the DB modal). */
export function ExcelSheetModal({ pending, onLoad, onCancel }: Props) {
  const tv = useT().variables;
  const [sheet, setSheet] = useState(() => pending.sheets[0] ?? '');
  const [loading, setLoading] = useState(false);

  const handleLoad = () => {
    if (sheet === '') return;
    setLoading(true);
    void onLoad(sheet).then((ok) => {
      if (!ok) setLoading(false);
    });
  };

  return (
    <DialogShell
      onClose={onCancel}
      labelledBy="excel-sheet-title"
      boxClassName="bg-surface border border-border rounded-lg w-80 flex flex-col shadow-2xl"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span
          id="excel-sheet-title"
          className="font-mono text-xs text-muted uppercase tracking-widest truncate"
          title={pending.filename}
        >
          {pending.filename}
        </span>
        <button
          onClick={onCancel}
          aria-label={tv.csvClose}
          className="p-0.5 rounded text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col gap-1 px-4 py-4 font-mono text-xs">
        <label className="text-[10px] text-muted uppercase tracking-wider">
          {tv.excelSheetLabel}
        </label>
        <Select<string>
          value={sheet}
          onChange={setSheet}
          groups={[{ options: pending.sheets.map((s) => ({ value: s, label: s })) }]}
        />
      </div>

      <div className="flex justify-end items-center gap-2 px-4 py-3 border-t border-border">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-xs font-mono text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          {tv.cancel}
        </button>
        <button
          onClick={handleLoad}
          disabled={sheet === '' || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-accent text-bg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          <ArrowUpTrayIcon className="w-3.5 h-3.5" />
          {tv.dbLoad}
        </button>
      </div>
    </DialogShell>
  );
}
