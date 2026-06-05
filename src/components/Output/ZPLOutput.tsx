import { useState, type ReactNode } from 'react';
import { CheckIcon, ClipboardDocumentIcon, ChevronDownIcon, ChevronUpIcon, EyeIcon } from '@heroicons/react/16/solid';
import { useLabelStore, selectLabelaryNoticeRequired } from '../../store/labelStore';
import { generateMultiPageZPL } from '../../lib/zplGenerator';
import { useCopyToClipboard } from '../../lib/useCopyToClipboard';
import { useT } from '../../lib/useT';
import { LabelaryNoticeModal } from './LabelaryNoticeModal';
import { ZplLine } from './ZplLine';

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

  return (
    <div className="flex flex-col h-full">
      <OutputSection
        heading={t.output.zplHeading}
        content={zpl}
        emptyMessage={t.output.noObjects}
        collapsed={collapsed}
        onCollapseToggle={collapsed ? onExpand : onCollapse}
        collapseLabel={collapsed ? t.app.expand : t.app.collapse}
        extraActions={labelaryEnabled && (
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
      />

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

/** Single output pane: header (collapse toggle + heading + extra
 *  actions + copy button) and a `<pre>` body. The Setup-Script
 *  output moved into the Printer Settings modal's docked preview
 *  pane, so this component no longer needs to host a secondary
 *  variant; it just shows the per-label ZPL. */
function OutputSection({
  heading,
  content,
  emptyMessage,
  collapsed,
  onCollapseToggle,
  collapseLabel,
  extraActions,
}: {
  heading: string;
  content: string;
  emptyMessage: string;
  collapsed?: boolean;
  onCollapseToggle?: () => void;
  collapseLabel?: string;
  extraActions?: ReactNode;
}) {
  const t = useT();
  const { copy, copied } = useCopyToClipboard(() => content);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {onCollapseToggle && (
            <button
              className="p-0.5 rounded text-muted hover:text-text hover:bg-border transition-colors"
              onClick={onCollapseToggle}
              title={collapseLabel}
              aria-label={collapseLabel}
            >
              {collapsed ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
            </button>
          )}
          <span className="font-mono text-[10px] text-muted uppercase tracking-widest">{heading}</span>
        </div>
        <div className="flex items-center gap-3">
          {extraActions}
          <button
            onClick={copy}
            disabled={!content}
            title={t.output.copy}
            className="flex items-center gap-1 font-mono text-[10px] text-muted hover:text-accent disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            {copied
              ? <><CheckIcon className="w-4 h-4" />{t.output.copied}</>
              : <><ClipboardDocumentIcon className="w-4 h-4" />{t.output.copy}</>}
          </button>
        </div>
      </div>

      {!collapsed && (
        <pre className="overflow-auto p-3 font-mono text-xs leading-relaxed text-text m-0 bg-surface flex-1">
          {content
            ? content.split('\n').map((line, i) => (
                <ZplLine key={i} line={line} />
              ))
            : <span className="text-muted">{emptyMessage}</span>
          }
        </pre>
      )}
    </div>
  );
}

