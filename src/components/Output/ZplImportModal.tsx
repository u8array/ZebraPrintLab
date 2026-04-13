import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/16/solid';
import { parseZPL } from '../../lib/zplParser';
import { useLabelStore } from '../../store/labelStore';

interface Props {
  onClose: () => void;
}

export function ZplImportModal({ onClose }: Props) {
  const [zpl, setZpl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const loadDesign = useLabelStore((s) => s.loadDesign);
  const label = useLabelStore((s) => s.label);

  const handleImport = () => {
    setError(null);
    if (!zpl.trim()) {
      setError('Please paste some ZPL code first.');
      return;
    }

    const { labelConfig, objects, skipped } = parseZPL(zpl, label.dpmm);

    if (objects.length === 0 && Object.keys(labelConfig).length === 0) {
      setError('No supported objects found in the ZPL code.');
      return;
    }

    loadDesign({ ...label, ...labelConfig }, objects);

    if (skipped.length > 0) {
      // Close and let the user know via a brief message
      setError(
        `Imported ${objects.length} object(s). ${skipped.length} unsupported command(s) were skipped.`,
      );
      return;
    }

    onClose();
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

        {/* Body */}
        <div className="flex flex-col gap-3 p-4 flex-1 min-h-0">
          <p className="font-mono text-[10px] text-muted leading-relaxed">
            Paste ZPL II code below. Supported: text (^A0), barcodes (^BC, ^B3, ^BE, ^BQ, ^BX),
            box/line (^GB), ellipse (^GE). Label dimensions are read from ^PW/^LL.
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
      </div>
    </div>
  );
}
