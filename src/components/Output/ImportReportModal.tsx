import { useState } from 'react';
import { XMarkIcon, ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/16/solid';
import type { ImportReport } from '../../lib/zplParser';
import { ZPL_COMMAND_MAP } from '../../lib/zplCommandSupport';

export interface ImportResult {
  objectCount: number;
  report: ImportReport;
}

/** Returns the loss description for a partial command code, e.g. "^A@" → font face note. */
function partialLoss(cmd: string): string {
  const key = cmd.slice(1);
  const entry = ZPL_COMMAND_MAP.get(key) ?? (key[0] === 'A' ? ZPL_COMMAND_MAP.get('A@') : undefined);
  return entry?.loss ?? 'imported with limitations';
}

function formatReportAsText(result: ImportResult): string {
  const { objectCount, report } = result;
  const lines: string[] = [
    `ZPL Import Report`,
    `Objects imported: ${objectCount}`,
    '',
  ];
  if (report.partial.length > 0) {
    const uniqueLosses = [...new Set(report.partial.map(partialLoss))];
    lines.push(`Partially imported (${report.partial.join(', ')}): ${uniqueLosses.join('; ')}`);
  }
  if (report.browserLimit.length > 0) {
    lines.push(`Skipped (printer-only): ${report.browserLimit.map((t) => t.split(',')[0]).join(', ')}`);
  }
  if (report.unknown.length > 0) {
    lines.push(`Skipped (unrecognised): ${report.unknown.map((t) => t.split(',')[0]).join(', ')}`);
  }
  if (report.partial.length === 0 && report.browserLimit.length === 0 && report.unknown.length === 0) {
    lines.push('All commands recognised — no design information was lost.');
  }
  return lines.join('\n');
}

export function ImportSummaryBody({ result }: { result: ImportResult }) {
  const { objectCount, report } = result;
  const hasIssues = report.partial.length > 0 || report.browserLimit.length > 0 || report.unknown.length > 0;
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
          ({report.partial.join(', ')}): {uniqueLosses.join('; ')}
        </div>
      )}

      {report.browserLimit.length > 0 && (
        <div className="font-mono text-[10px] text-amber-400 leading-relaxed">
          <span className="font-semibold">Skipped (printer-only)</span>{' '}
          — {report.browserLimit.map((t) => t.split(',')[0]).join(', ')}
        </div>
      )}

      {report.unknown.length > 0 && (
        <div className="font-mono text-[10px] text-muted leading-relaxed">
          <span className="font-semibold">Skipped (unrecognised)</span>{' '}
          — {report.unknown.length} command{report.unknown.length !== 1 ? 's' : ''} not mapped:{' '}
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

interface Props {
  result: ImportResult;
  onClose: () => void;
}

export function ImportReportModal({ result, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(formatReportAsText(result)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface border border-border rounded-lg w-130 flex flex-col shadow-2xl max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="font-mono text-xs text-muted uppercase tracking-widest">Import Report</span>
          <button
            onClick={onClose}
            className="p-0.5 rounded text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <ImportSummaryBody result={result} />

        <div className="flex justify-between items-center px-4 py-3 border-t border-border shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 font-mono text-[10px] text-muted hover:text-text transition-colors"
          >
            {copied
              ? <><CheckIcon className="w-3.5 h-3.5" /> Copied</>
              : <><ClipboardDocumentIcon className="w-3.5 h-3.5" /> Copy report</>}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-mono bg-accent text-bg hover:opacity-90 transition-opacity"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
