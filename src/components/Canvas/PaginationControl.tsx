import { useState } from "react";
import { TrashIcon } from "@heroicons/react/16/solid";
import { useLabelStore } from "../../store/labelStore";
import { useT } from "../../lib/useT";
import { ConfirmDialog } from "../ui/ConfirmDialog";

export function PaginationControl() {
  const t = useT();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pageCount = useLabelStore((s) => s.pages.length);
  const currentPageIndex = useLabelStore((s) => s.currentPageIndex);
  const setCurrentPage = useLabelStore((s) => s.setCurrentPage);
  const removePage = useLabelStore((s) => s.removePage);

  // Hide entirely on single-page documents; adding pages lives in the File menu.
  if (pageCount <= 1) return null;

  const canPrev = currentPageIndex > 0;
  const canNext = currentPageIndex < pageCount - 1;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-surface border border-border rounded px-1 py-0.5">
      <button
        onClick={() => canPrev && setCurrentPage(currentPageIndex - 1)}
        disabled={!canPrev}
        title="Previous page (Page Up)"
        aria-label="Previous page"
        className="w-6 h-6 flex items-center justify-center text-muted hover:text-text disabled:opacity-25 disabled:cursor-not-allowed font-mono text-sm transition-colors"
      >
        ‹
      </button>
      <span className="font-mono text-[10px] text-text px-2 select-none whitespace-nowrap">
        Page {currentPageIndex + 1} / {pageCount}
      </span>
      <button
        onClick={() => canNext && setCurrentPage(currentPageIndex + 1)}
        disabled={!canNext}
        title="Next page (Page Down)"
        aria-label="Next page"
        className="w-6 h-6 flex items-center justify-center text-muted hover:text-text disabled:opacity-25 disabled:cursor-not-allowed font-mono text-sm transition-colors"
      >
        ›
      </button>
      <div className="w-px h-3.5 bg-border mx-0.5" />
      <button
        onClick={() => setConfirmOpen(true)}
        title="Delete current page"
        aria-label="Delete current page"
        className="w-6 h-6 flex items-center justify-center text-muted hover:text-red-400 transition-colors"
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
      {confirmOpen && (
        <ConfirmDialog
          message={t.app.deletePageConfirm}
          confirmLabel={t.app.deletePage}
          cancelLabel={t.app.cancel}
          destructive
          onConfirm={() => {
            removePage(currentPageIndex);
            setConfirmOpen(false);
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
