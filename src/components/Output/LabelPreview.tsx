import { useEffect, useRef, useState } from 'react';
import { XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/16/solid';
import { useLabelStore } from '../../store/labelStore';
import { generateZPL } from '../../lib/zplGenerator';
import { fetchPreview, LabelaryError } from '../../lib/labelary';
import { triggerDownload } from '../../lib/triggerDownload';
import { useT } from '../../lib/useT';

interface Props {
  onClose: () => void;
}

function errorMessage(e: unknown): string {
  if (e instanceof LabelaryError) {
    if (e.kind === 'api') return 'Labelary returned an error. Check that the label dimensions and dpmm are valid.';
    if (e.kind === 'timeout') return 'Labelary did not respond in time.';
  }
  return 'Could not reach the Labelary preview service. Check your network connection.';
}

export function LabelPreviewModal({ onClose }: Props) {
  const t = useT();
  const { label, objects } = useLabelStore();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const zplRef = useRef<string>(generateZPL(label, objects));

  useEffect(() => {
    let cancelled = false;
    fetchPreview(zplRef.current, label)
      .then((url) => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        urlRef.current = url;
        setPreviewUrl(url);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(errorMessage(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownloadFallback = () => {
    triggerDownload(new Blob([zplRef.current], { type: 'text/plain' }), 'label.zpl');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded shadow-lg flex flex-col overflow-hidden max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
          <span className="font-mono text-[10px] text-muted uppercase tracking-widest">
            {t.output.previewHeading}
          </span>
          <button
            onClick={onClose}
            className="p-0.5 rounded text-muted hover:text-text hover:bg-surface-2 transition-colors ml-6"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 min-h-24 min-w-48">
          {loading && (
            <span className="font-mono text-[10px] text-muted animate-pulse">{t.output.loading}</span>
          )}
          {!loading && error && (
            <div className="flex flex-col items-center gap-3 max-w-64 text-center">
              <span className="font-mono text-[10px] text-amber-400 leading-relaxed">{error}</span>
              <button
                onClick={handleDownloadFallback}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono bg-surface-2 border border-border text-muted hover:text-text hover:border-accent transition-colors"
              >
                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                Export ZPL instead
              </button>
            </div>
          )}
          {!loading && !error && previewUrl && (
            <img
              src={previewUrl}
              alt="Label preview"
              className="max-w-full max-h-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
