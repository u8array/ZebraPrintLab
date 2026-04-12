import { useEffect, useRef, useState } from 'react';
import { useLabelStore } from '../../store/labelStore';
import { generateZPL } from '../../lib/zplGenerator';
import { fetchPreview } from '../../lib/labelary';
import { useT } from '../../lib/useT';

interface Props {
  onClose: () => void;
}

export function LabelPreviewModal({ onClose }: Props) {
  const t = useT();
  const { label, objects } = useLabelStore();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const zpl = generateZPL(label, objects);
    fetchPreview(zpl, label)
      .then((url) => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        urlRef.current = url;
        setPreviewUrl(url);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) { setError(true); setLoading(false); }
      });
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            className="font-mono text-[10px] text-muted hover:text-accent transition-colors ml-6"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 min-h-24 min-w-48">
          {loading && (
            <span className="font-mono text-[10px] text-muted animate-pulse">{t.output.loading}</span>
          )}
          {!loading && error && (
            <span className="font-mono text-[10px] text-muted">{t.output.unavailable}</span>
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
