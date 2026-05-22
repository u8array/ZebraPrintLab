import { useState } from 'react';
import { CheckIcon, ClipboardDocumentIcon, ChevronDownIcon, ChevronUpIcon, EyeIcon } from '@heroicons/react/16/solid';
import { useLabelStore, selectLabelaryNoticeRequired } from '../../store/labelStore';
import { generateMultiPageZPL } from '../../lib/zplGenerator';
import { useT } from '../../lib/useT';
import { LabelaryNoticeModal } from './LabelaryNoticeModal';

interface Props {
  collapsed?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
}

export function ZPLOutput({ collapsed, onCollapse, onExpand }: Props) {
  const t = useT();
  const label = useLabelStore((s) => s.label);
  const pages = useLabelStore((s) => s.pages);
  const variables = useLabelStore((s) => s.variables);
  const labelaryEnabled = useLabelStore((s) => s.thirdParty.labelary);
  const noticeRequired = useLabelStore(selectLabelaryNoticeRequired);
  const previewMode = useLabelStore((s) => s.previewMode);
  const enterPreviewMode = useLabelStore((s) => s.enterPreviewMode);
  const exitPreviewMode = useLabelStore((s) => s.exitPreviewMode);
  const [copied, setCopied] = useState(false);
  const [showNotice, setShowNotice] = useState(false);

  const hasObjects = pages.some((p) => p.objects.length > 0);
  const zpl = hasObjects ? generateMultiPageZPL(label, pages, variables) : '';

  const previewActive =
    previewMode.status === 'loading' || previewMode.status === 'active';

  const togglePreview = () => {
    if (previewActive) {
      exitPreviewMode();
      return;
    }
    if (noticeRequired) {
      setShowNotice(true);
      return;
    }
    void enterPreviewMode();
  };

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
        <div className="flex items-center gap-2">
          <button
            className="p-0.5 rounded text-muted hover:text-text hover:bg-border transition-colors"
            onClick={collapsed ? onExpand : onCollapse}
            title={collapsed ? t.app.expand : t.app.collapse}
            aria-label={collapsed ? t.app.expand : t.app.collapse}
          >
            {collapsed ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
          </button>
          <span className="font-mono text-[10px] text-muted uppercase tracking-widest">{t.output.zplHeading}</span>
        </div>
        <div className="flex items-center gap-3">
          {labelaryEnabled && (
            <button
              onClick={togglePreview}
              disabled={!zpl && !previewActive}
              title={t.output.previewHeading}
              aria-pressed={previewActive}
              className={`flex items-center gap-1 font-mono text-[10px] disabled:opacity-25 disabled:cursor-not-allowed transition-colors ${
                previewActive
                  ? 'text-accent hover:text-text'
                  : 'text-muted hover:text-accent'
              }`}
            >
              <EyeIcon className="w-4 h-4" />
              {t.output.previewHeading}
            </button>
          )}
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

      {!collapsed && <pre className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed text-text m-0 bg-surface">
        {zpl
          ? zpl.split('\n').map((line, i) => (
              <ZplLine key={i} line={line} />
            ))
          : <span className="text-muted">{t.output.noObjects}</span>
        }
      </pre>}
      {showNotice && (
        <LabelaryNoticeModal
          onClose={() => setShowNotice(false)}
          onContinue={() => {
            setShowNotice(false);
            void enterPreviewMode();
          }}
        />
      )}
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
