import { useState } from 'react';
import { CheckIcon, ClipboardDocumentIcon, EyeIcon } from '@heroicons/react/16/solid';
import { useLabelStore } from '../../store/labelStore';
import { generateZPL } from '../../lib/zplGenerator';
import { useT } from '../../lib/useT';
import { LabelPreviewModal } from './LabelPreview';

export function ZPLOutput() {
  const t = useT();
  const { label, objects } = useLabelStore();
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const zpl = objects.length > 0 ? generateZPL(label, objects) : '';

  const handleCopy = () => {
    if (!zpl) return;
    navigator.clipboard.writeText(zpl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <span className="font-mono text-[10px] text-muted uppercase tracking-widest">{t.output.zplHeading}</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPreview(true)}
            disabled={!zpl}
            title={t.output.previewHeading}
            className="flex items-center gap-1 font-mono text-[10px] text-muted hover:text-accent disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            <EyeIcon className="w-4 h-4" />
            {t.output.previewHeading}
          </button>
          <button
            onClick={handleCopy}
            disabled={!zpl}
            title={t.output.copy}
            className="flex items-center gap-1 font-mono text-[10px] text-muted hover:text-accent disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            {copied
              ? <><CheckIcon className="w-4 h-4" />{t.output.copied}</>
              : <><ClipboardDocumentIcon className="w-4 h-4" />{t.output.copy}</>}
          </button>
        </div>
      </div>

      <pre className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed text-text m-0">
        {zpl
          ? zpl.split('\n').map((line, i) => (
              <ZplLine key={i} line={line} />
            ))
          : <span className="text-muted">{t.output.noObjects}</span>
        }
      </pre>
      {showPreview && <LabelPreviewModal onClose={() => setShowPreview(false)} />}
    </div>
  );
}

function ZplLine({ line }: { line: string }) {
  // highlight ^CMD tokens in amber, rest in default text color
  const parts = line.split(/([\^][A-Z0-9]+)/g);
  return (
    <span className="block">
      {parts.map((part, i) =>
        /^\^[A-Z0-9]+$/.test(part)
          ? <span key={i} className="text-accent">{part}</span>
          : <span key={i} className="text-text">{part}</span>
      )}
    </span>
  );
}
