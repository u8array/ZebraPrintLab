import { useState } from 'react';
import { useLabelStore } from '../../store/labelStore';
import { generateZPL } from '../../lib/zplGenerator';
import t from '../../locales/en';

export function ZPLOutput() {
  const { label, objects } = useLabelStore();
  const [copied, setCopied] = useState(false);

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
        <button
          onClick={handleCopy}
          disabled={!zpl}
          className="font-mono text-[10px] text-muted hover:text-accent disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          {copied ? t.output.copied : t.output.copy}
        </button>
      </div>

      <pre className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed text-text m-0">
        {zpl
          ? zpl.split('\n').map((line, i) => (
              <ZplLine key={i} line={line} />
            ))
          : <span className="text-muted">{t.output.noObjects}</span>
        }
      </pre>
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
