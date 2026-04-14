import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/16/solid';
import { parseZPL, type ImportReport } from '../../lib/zplParser';
import { ZPL_COMMAND_MAP } from '../../lib/zplCommandSupport';
import { useLabelStore } from '../../store/labelStore';

interface Props {
  onClose: () => void;
}

interface ImportResult {
  objectCount: number;
  report: ImportReport;
}

/** Returns the loss description for a partial command code, e.g. "^A@" → font face note. */
function partialLoss(cmd: string): string {
  const key = cmd.slice(1); // strip ^
  // General ^A{x} bitmap fonts share the same loss note as the explicit ^A@ entry
  const entry = ZPL_COMMAND_MAP.get(key) ?? (key[0] === 'A' ? ZPL_COMMAND_MAP.get('A@') : undefined);
  return entry?.loss ?? 'imported with limitations';
}

function ImportSummaryBody({ result }: { result: ImportResult }) {
  const { objectCount, report } = result;
  const hasIssues =
    report.partial.length > 0 ||
    report.browserLimit.length > 0 ||
    report.unknown.length > 0;

  // Deduplicate loss descriptions so repeated ^A@ / ^AB don't produce duplicate lines
  const uniqueLosses = [...new Set(report.partial.map(partialLoss))];

  return (
    <div className="flex flex-col gap-3 p-4 flex-1 min-h-0">
      <p className="font-mono text-[10px] text-green-400 leading-relaxed">
        {objectCount} object{objectCount !== 1 ? 's' : ''} imported as editable reconstruction.
        The original ZPL model is not preserved — save as .json to keep an exact copy.
      </p>

      {report.partial.length > 0 && (
        <div className="font-mono text-[10px] text-amber-400 leading-relaxed">
          <span className="font-semibold">Partially imported</span>{' '}
          ({report.partial.join(', ')}):{' '}
          {uniqueLosses.join('; ')}
        </div>
      )}

      {report.browserLimit.length > 0 && (
        <div className="font-mono text-[10px] text-amber-400 leading-relaxed">
          <span className="font-semibold">Skipped (printer-only)</span> —{' '}
          {report.browserLimit.map((t) => t.split(',')[0]).join(', ')}
        </div>
      )}

      {report.unknown.length > 0 && (
        <div className="font-mono text-[10px] text-muted leading-relaxed">
          <span className="font-semibold">Skipped (unrecognised)</span> —{' '}
          {report.unknown.length} command{report.unknown.length !== 1 ? 's' : ''} not mapped:{' '}
          {report.unknown.slice(0, 5).map((t) => t.split(',')[0]).join(', ')}
          {report.unknown.length > 5 && ` … +${report.unknown.length - 5} more`}
        </div>
      )}

      {!hasIssues && (
        <p className="font-mono text-[10px] text-muted leading-relaxed">
          All commands recognised — no design information was lost.
        </p>
      )}
    </div>
  );
}

export function ZplImportModal({ onClose }: Props) {
  const [zpl, setZpl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const loadDesign = useLabelStore((s) => s.loadDesign);
  const label = useLabelStore((s) => s.label);

  const handleImport = () => {
    setError(null);
    if (!zpl.trim()) {
      setError('Please paste some ZPL code first.');
      return;
    }

    const { labelConfig, objects, importReport } = parseZPL(zpl, label.dpmm);

    if (objects.length === 0 && Object.keys(labelConfig).length === 0) {
      setError('No supported objects found in the ZPL code.');
      return;
    }

    loadDesign({ ...label, ...labelConfig }, objects);
    setResult({ objectCount: objects.length, report: importReport });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface border border-border rounded-lg w-130 flex flex-col shadow-2xl max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="font-mono text-xs text-muted uppercase tracking-widest">Import ZPL</span>
          <button
            onClick={onClose}
            className="p-0.5 rounded text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {result ? (
          <>
            <ImportSummaryBody result={result} />
            <div className="flex justify-end px-4 py-3 border-t border-border shrink-0">
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded text-xs font-mono bg-accent text-bg hover:opacity-90 transition-opacity"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Body */}
            <div className="flex flex-col gap-3 p-4 flex-1 min-h-0">
              <p className="font-mono text-[10px] text-muted leading-relaxed">
                Paste ZPL II code below. The result is an{' '}
                <span className="text-amber-400">editable reconstruction</span>{' '}
                — not an exact replica of the original model. Use{' '}
                <span className="text-text">Save design (.json)</span> to preserve
                a lossless copy.
              </p>
              <p className="font-mono text-[10px] text-muted leading-relaxed">
                Supported: text (^A0/^CF), barcodes (^BC, ^B3, ^BE, ^BQ, ^BX, ^BU, ^B8, ^B9,
                ^B2, ^BA, ^B7), shapes (^GB, ^GD, ^GE, ^GC), images (^GFA),
                serialisation (^SN, ^SF). Label dimensions from ^PW/^LL.
              </p>
              <textarea
                className="flex-1 min-h-60 bg-surface-2 border border-border rounded px-3 py-2 font-mono text-xs text-text focus:border-accent focus:outline-none resize-none"
                placeholder="^XA&#10;^PW800&#10;^LL480&#10;^FO50,50^A0N,30,0^FDHello World^FS&#10;^XZ"
                value={zpl}
                onChange={(e) => setZpl(e.target.value)}
                spellCheck={false}
              />
              {error && (
                <p className="font-mono text-[10px] text-amber-400 leading-relaxed">{error}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded text-xs font-mono text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!zpl.trim()}
                className="px-3 py-1.5 rounded text-xs font-mono bg-accent text-bg hover:opacity-90 disabled:opacity-25 disabled:cursor-not-allowed transition-opacity"
              >
                Import
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
