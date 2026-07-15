import { useRef, useState } from "react";
import { ExclamationTriangleIcon, ExclamationCircleIcon } from "@heroicons/react/16/solid";
import { typeLabelFor } from "../../registry/palettePresets";
import type { LeafObject } from "../../registry";
import { useT } from "../../hooks/useT";
import { useDismiss } from "../../hooks/useDismiss";
import { Tooltip } from "../ui/Tooltip";
import type { PreflightFinding, PreflightKind } from "../../lib/preflight";

interface Props {
  findings: PreflightFinding[];
  /** Leaves of the current page, to resolve a finding's display name. */
  objects: readonly LeafObject[];
  onSelect: (id: string) => void;
}

/** Top-right preflight indicator: a count badge (red when any error, else
 *  amber) opening a list of the current page's findings. Clicking a row selects
 *  the object, so an off-screen off-label object is still reachable. DOM overlay
 *  (not Konva) so it composes with normal tooltips/popover idioms. */
export function PreflightOverlay({ findings, objects, onSelect }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Treat the popover as open only while there is something to show, so the
  // dismiss listeners tear down the moment findings drain.
  const showList = open && findings.length > 0;
  useDismiss(rootRef, () => setOpen(false), { active: showList });

  if (findings.length === 0) return null;

  const byId = new Map(objects.map((o) => [o.id, o]));
  const hasError = findings.some((f) => f.severity === "error");
  const BadgeIcon = hasError ? ExclamationCircleIcon : ExclamationTriangleIcon;
  // Locale keys are named exactly after PreflightKind, so the lookup is direct
  // and compile-checked (the kind union must be a subset of t.preflight's
  // keys); a new kind needs no edit here.
  const kindText = (kind: PreflightKind): string => t.preflight[kind];
  const nameOf = (id: string) => {
    const o = byId.get(id);
    if (!o) return id;
    // `||` (not `??`) so an empty name falls through to the shared type label.
    return o.name || typeLabelFor(o.type, t);
  };

  return (
    <div ref={rootRef} className="relative pointer-events-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.preflight.heading}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1 rounded border bg-surface px-1.5 py-0.5 text-[10px] font-mono transition-colors ${
          hasError ? "border-error/60 text-error" : "border-accent/60 text-accent"
        }`}
      >
        <BadgeIcon className="w-3.5 h-3.5" />
        {findings.length}
      </button>
      {showList && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-surface border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border text-xs font-medium text-text">
            {t.preflight.heading}
          </div>
          <div role="menu" className="flex flex-col max-h-72 overflow-y-auto">
            {findings.map((f, i) => {
              const Icon = f.severity === "error" ? ExclamationCircleIcon : ExclamationTriangleIcon;
              const tone = f.severity === "error" ? "text-error" : "text-accent";
              // Tooltip instead of native title: the truncated detail is
              // readable in full without the ~1s hover delay, and on focus.
              // role="none" keeps the wrapper transparent so the menuitem
              // stays a direct owned child of role=menu.
              return (
                <Tooltip key={`${f.objectId}-${i}`} content={f.detail} className="w-full" wrapperRole="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSelect(f.objectId);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-surface-2 transition-colors"
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${tone}`} />
                    <span className="flex flex-col min-w-0">
                      <span className="truncate text-text">{nameOf(f.objectId)}</span>
                      {f.detail && <span className="truncate text-[10px] text-muted">{f.detail}</span>}
                    </span>
                    <span className="ml-auto shrink-0 text-muted">{kindText(f.kind)}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
