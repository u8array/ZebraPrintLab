import { useEffect, useRef, useState } from 'react';
import { XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/16/solid';
import { useLabelStore, useCurrentObjects } from '../../store/labelStore';
import { generateZPL } from '../../lib/zplGenerator';
import { fetchPreview, labelaryErrorMessage } from '../../lib/labelary';
import { triggerDownload } from '../../lib/triggerDownload';
import { useT } from '../../lib/useT';

interface Props {
  onClose: () => void;
}

/** Preview modal — assumes the privacy notice has already been
 *  acknowledged. Callers (ZPLOutput) gate the modal behind
 *  LabelaryNoticeModal so this component never has to handle the
 *  pre-ack state. */
export function LabelPreviewModal({ onClose }: Props) {
  const t = useT();
  const label = useLabelStore((s) => s.label);
  const objects = useCurrentObjects();

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const zplRef = useRef<string>(generateZPL(label, objects));
  const loading = !previewUrl && !error;

  useEffect(() => {
    let cancelled = false;
    fetchPreview(zplRef.current, label)
      .then((url) => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        urlRef.current = url;
        setPreviewUrl(url);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(labelaryErrorMessage(e));
      });
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // `label` and the generated ZPL are intentionally captured once at mount
    // (via zplRef): the preview should reflect the snapshot the user saw when
    // they opened the modal, not refetch when the canvas changes underneath.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownloadFallback = () => {
    triggerDownload(new Blob([zplRef.current], { type: 'text/plain' }), 'label.zpl');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="label-preview-title"
    >
      <div
        className="bg-surface border border-border-2 rounded shadow-lg flex flex-col overflow-hidden max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-2 shrink-0">
          <span id="label-preview-title" className="font-mono text-[10px] text-muted uppercase tracking-widest">
            {t.output.previewHeading}
          </span>
          <button
            onClick={onClose}
            aria-label={t.app.close}
            className="p-0.5 rounded text-muted hover:text-text hover:bg-surface-2 transition-colors ml-6"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Inset preview area: bg-bg gives a clear edge against the surrounding
            surface (especially in light mode where the label image is white).
            The outer div scrolls; the inner one stays at least as large as the
            viewport so small previews are still centered. */}
        <div className="flex-1 overflow-auto bg-bg min-h-24 min-w-48">
          <div className="min-h-full min-w-full flex items-center justify-center p-4">
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
                className="block shrink-0"
              />
            )}
          </div>
        </div>

        <div className="px-3 py-1 border-t border-border-2 shrink-0 text-center">
          <a
            href="https://labelary.com/"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[9px] text-muted hover:text-accent transition-colors"
          >
            {t.output.previewProvider}
          </a>
        </div>
      </div>
    </div>
  );
}
