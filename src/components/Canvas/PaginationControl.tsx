import { useLabelStore } from "../../store/labelStore";

export function PaginationControl() {
  const pageCount = useLabelStore((s) => s.pages.length);
  const currentPageIndex = useLabelStore((s) => s.currentPageIndex);
  const setCurrentPage = useLabelStore((s) => s.setCurrentPage);
  const addPage = useLabelStore((s) => s.addPage);
  const removePage = useLabelStore((s) => s.removePage);

  const canPrev = currentPageIndex > 0;
  const canNext = currentPageIndex < pageCount - 1;
  const canRemove = pageCount > 1;

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
        onClick={addPage}
        title="Add page"
        aria-label="Add page"
        className="w-6 h-6 flex items-center justify-center text-muted hover:text-text font-mono text-sm transition-colors"
      >
        +
      </button>
      <button
        onClick={() => canRemove && removePage(currentPageIndex)}
        disabled={!canRemove}
        title="Delete current page"
        aria-label="Delete current page"
        className="w-6 h-6 flex items-center justify-center text-muted hover:text-text disabled:opacity-25 disabled:cursor-not-allowed font-mono text-sm transition-colors"
      >
        −
      </button>
    </div>
  );
}
