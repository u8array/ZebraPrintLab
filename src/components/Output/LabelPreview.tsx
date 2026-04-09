import { useEffect, useRef, useState } from 'react';
import { useLabelStore } from '../../store/labelStore';
import { generateZPL } from '../../lib/zplGenerator';
import { fetchPreview } from '../../lib/labelary';
import { useT } from '../../lib/useT';

export function LabelPreview() {
  const t = useT();
  const { label, objects } = useLabelStore();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (objects.length === 0) {
      setPreviewUrl(null);
      setError(false);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const zpl = generateZPL(label, objects);
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        const url = await fetchPreview(zpl, label);
        prevUrlRef.current = url;
        setPreviewUrl(url);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [label, objects]);

  // revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-border shrink-0">
        <span className="font-mono text-[10px] text-muted uppercase tracking-widest">{t.output.previewHeading}</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-2 overflow-hidden">
        {loading && (
          <span className="font-mono text-[10px] text-muted animate-pulse">{t.output.loading}</span>
        )}
        {!loading && error && (
          <span className="font-mono text-[10px] text-muted">{t.output.unavailable}</span>
        )}
        {!loading && !error && previewUrl && (
          <img
            src={previewUrl}
            alt="Label-Vorschau"
            className="max-w-full max-h-full object-contain"
            style={{ imageRendering: 'pixelated' }}
          />
        )}
        {!loading && !error && !previewUrl && (
          <span className="font-mono text-[10px] text-muted text-center leading-relaxed whitespace-pre-line">
            {t.output.previewEmpty}
          </span>
        )}
      </div>
    </div>
  );
}
