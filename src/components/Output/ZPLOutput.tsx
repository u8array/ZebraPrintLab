import { useState, type ReactNode } from 'react';
import { CheckIcon, ClipboardDocumentIcon, ChevronDownIcon, ChevronUpIcon, EyeIcon } from '@heroicons/react/16/solid';
import { useLabelStore, selectLabelaryNoticeRequired } from '../../store/labelStore';
import { generateMultiPageZPL } from '../../lib/zplGenerator';
import { generateSetupScript } from '../../lib/zplSetupScript';
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
  const [showNotice, setShowNotice] = useState(false);

  const hasObjects = pages.some((p) => p.objects.length > 0);
  const zpl = hasObjects ? generateMultiPageZPL(label, pages, variables) : '';
  const setupScript = generateSetupScript(label);

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
        variant="primary"
        heading={t.output.zplHeading}
        content={zpl}
        emptyMessage={t.output.noObjects}
        collapsed={collapsed}
        onCollapseToggle={collapsed ? onExpand : onCollapse}
        collapseLabel={collapsed ? t.app.expand : t.app.collapse}
        /* Hidden-secondary indicator: when the panel is collapsed,
           the Setup-Script section is also hidden but still has
           emit-worthy content. A small accent dot in the header
           signals "there is more output below" so users do not
           silently lose visibility of their printer-state edits. */
        hiddenSecondaryActive={!!collapsed && !!setupScript}
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

      {/* Setup-Script section only renders when at least one EEPROM-
          persistent printer-state field is set. The Printer Settings
          Modal is where users enable those (^JZ, ^JT, ~TA, plus the
          upcoming clock/encoding/identity commands); the output here
          shows what would be sent once to provision the printer. */}
      {!collapsed && setupScript && (
        <OutputSection
          variant="secondary"
          heading={t.output.setupScriptHeading}
          content={setupScript}
          emptyMessage=""
        />
      )}

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
 *  actions + copy button) and a `<pre>` body. Reused for the main
 *  per-label ZPL and the Setup-Script output so both sections share
 *  the same look (and any future tweaks land in one place).
 *
 *  `variant='primary'` fills the remaining flex space (used by the
 *  main per-label ZPL). `variant='secondary'` gets a top border + a
 *  bounded max-height so it sits compactly under the primary pane
 *  (used by the Setup-Script output). The variant collapses two
 *  separate booleans (`borderTop` / `maxHeightClass`) into one
 *  honest discriminator. */
function OutputSection({
  variant,
  heading,
  content,
  emptyMessage,
  collapsed,
  onCollapseToggle,
  collapseLabel,
  extraActions,
  hiddenSecondaryActive,
}: {
  variant: 'primary' | 'secondary';
  heading: string;
  content: string;
  emptyMessage: string;
  collapsed?: boolean;
  onCollapseToggle?: () => void;
  collapseLabel?: string;
  extraActions?: ReactNode;
  /** When `true`, render a small accent dot next to the heading so
   *  users know a hidden secondary section has emit-worthy content
   *  even while this pane is collapsed. */
  hiddenSecondaryActive?: boolean;
}) {
  const isSecondary = variant === 'secondary';
  const containerCls = isSecondary
    ? 'border-t border-border'
    : 'flex-1 min-h-0';
  const bodyCls = isSecondary ? 'max-h-48' : 'flex-1';
  const t = useT();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!content) return;
    // `navigator.clipboard` is undefined in non-secure contexts
    // (plain HTTP, file://) and in some embedded WebViews. Bail
    // out instead of throwing — the copy button is non-essential.
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => { /* swallow: user-cancel or permission-denied */ });
  };

  return (
    <div className={`flex flex-col ${containerCls}`}>
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
          {hiddenSecondaryActive && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-accent"
              title={t.output.hiddenSecondaryHint}
              aria-label={t.output.hiddenSecondaryHint}
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          {extraActions}
          <button
            onClick={handleCopy}
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
        <pre className={`overflow-auto p-3 font-mono text-xs leading-relaxed text-text m-0 bg-surface ${bodyCls}`}>
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
