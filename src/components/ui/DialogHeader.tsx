import { XMarkIcon } from "@heroicons/react/24/outline";

/** Title + subtitle + close button for a DialogShell. `titleId`/`subtitleId`
 *  are wired to the shell's aria-labelledby/-describedby so the accessible name
 *  lives in one place. Shared by the builder modals. */
export function DialogHeader({
  titleId,
  subtitleId,
  title,
  subtitle,
  onClose,
  closeLabel,
}: {
  titleId: string;
  subtitleId: string;
  title: string;
  subtitle: string;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <header className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className="text-sm font-medium text-text">{title}</h2>
        <p id={subtitleId} className="text-[11px] text-muted">{subtitle}</p>
      </div>
      <button type="button" aria-label={closeLabel} onClick={onClose} className="text-muted hover:text-text">
        <XMarkIcon className="w-5 h-5" />
      </button>
    </header>
  );
}
