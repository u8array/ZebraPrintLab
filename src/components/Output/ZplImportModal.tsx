import { useRef, useState } from 'react';
import { XMarkIcon, ClipboardDocumentIcon, CheckIcon, FolderOpenIcon } from '@heroicons/react/16/solid';
import { importZplText } from '../../lib/zplImportService';
import { readFileAsText } from '../../lib/readFile';
import { useLabelStore } from '../../store/labelStore';
import { ImportSummaryBody, type ImportResult } from './ImportReportModal';

interface Props {
  onClose: () => void;
}

export function ZplImportModal({ onClose }: Props) {
  const [zpl, setZpl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadDesign = useLabelStore((s) => s.loadDesign);
  const label = useLabelStore((s) => s.label);

  const handleImport = () => {
    setError(null);
    if (!zpl.trim()) {
      setError('Please paste some ZPL code first.');
      return;
    }

    const { labelConfig, objects: parsedObjects, report } = importZplText(zpl, label.dpmm);

    if (parsedObjects.length === 0 && Object.keys(labelConfig).length === 0) {
      setError('No supported objects found in the ZPL code.');
      return;
    }

    loadDesign({ ...label, ...labelConfig }, parsedObjects);
    setResult({ objectCount: parsedObjects.length, report });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    let text: string;
    try {
      text = await readFileAsText(file);
    } catch {
      setError('Could not read the file.');
      return;
    }

    if (!text.trim()) {
      setError('The file appears to be empty.');
      return;
    }

    const { labelConfig, objects: parsedObjects, report } = importZplText(text, label.dpmm);
    loadDesign({ ...label, ...labelConfig }, parsedObjects);
    setResult({ objectCount: parsedObjects.length, report });
  };

  const handleCopy = () => {
    if (!result) return;
    const lines = [
      `ZPL Import Report`,
      `Objects imported: ${result.objectCount}`,
      '',
      ...(result.report.partial.length > 0
        ? [`Partially imported (${result.report.partial.join(', ')})`]
        : []),
      ...(result.report.browserLimit.length > 0
        ? [`Skipped (printer-only): ${result.report.browserLimit.map((t) => t.split(',')[0]).join(', ')}`]
        : []),
      ...(result.report.unknown.length > 0
        ? [`Skipped (unrecognised): ${result.report.unknown.map((t) => t.split(',')[0]).join(', ')}`]
        : []),
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
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
          </>
        ) : (
          <>
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
              <input
                ref={fileInputRef}
                type="file"
                accept=".zpl,text/plain"
                className="hidden"
                onChange={handleFileSelect}
              />
              {error && (
                <p className="font-mono text-[10px] text-amber-400 leading-relaxed">{error}</p>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-border shrink-0">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 font-mono text-[10px] text-muted hover:text-text transition-colors"
              >
                <FolderOpenIcon className="w-3.5 h-3.5" />
                Choose file
              </button>
              <div className="flex gap-2">
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
