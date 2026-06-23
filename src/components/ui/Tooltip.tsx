import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPosition } from "../../hooks/useAnchoredPosition";
import { resolveTooltipPosition } from "../../lib/tooltipPosition";

interface TooltipProps {
  /** Hover/focus hint. Falsy renders the child untouched (no wrapper). */
  content: ReactNode;
  /** Single focusable element; gets aria-describedby while the tip is open. */
  children: ReactElement;
  /** Preferred side; flips automatically when there's no room. */
  placement?: "top" | "bottom";
  /** Hover dwell before showing; shorter than native title's ~1s. */
  delayMs?: number;
  /** Extra classes for the inline-flex wrapper (e.g. self-start in a column). */
  className?: string;
}

/**
 * Hover/focus tooltip that replaces native `title`. Listeners sit on a wrapper
 * span so a `disabled` child still triggers it (disabled controls swallow their
 * own events). Portaled to body with fixed coords; the position is measured from
 * the rendered tip so it flips to the side with room and clamps into the
 * viewport (never clipped behind the top menu bar or a side edge).
 */
export function Tooltip({ content, children, placement = "top", delayMs = 120, className }: TooltipProps) {
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef(0);
  const [open, setOpen] = useState(false);

  // The tip is rendered (hidden) whenever open, so its size is known by the time
  // useAnchoredPosition measures; resolveTooltipPosition then flips/clamps it.
  const pos = useAnchoredPosition(wrapRef, open, (a) => {
    const t = tipRef.current?.getBoundingClientRect();
    return resolveTooltipPosition(
      a,
      { width: t?.width ?? 0, height: t?.height ?? 0 },
      { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      { preferred: placement },
    );
  });

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  if (!content || !isValidElement(children)) return children;

  // Hover dwells to avoid flicker on pass-through; focus shows at once so a
  // keyboard tab-through gets the aria-describedby hint announced.
  const showAfterDelay = () => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOpen(true), delayMs);
  };
  const showNow = () => {
    window.clearTimeout(timerRef.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(timerRef.current);
    setOpen(false);
  };

  const trigger = cloneElement(
    children as ReactElement<{ "aria-describedby"?: string }>,
    { "aria-describedby": open ? id : undefined },
  );

  return (
    <span
      ref={wrapRef}
      className={className ? `inline-flex ${className}` : "inline-flex"}
      onPointerEnter={showAfterDelay}
      onPointerLeave={hide}
      onFocus={showNow}
      onBlur={hide}
    >
      {trigger}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            // Hidden until measured to avoid a flash at the provisional 0,0.
            className="fixed z-[60] px-2 py-1 rounded bg-surface border border-border text-[10px] font-mono text-text shadow-lg pointer-events-none max-w-xs whitespace-normal break-words"
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, opacity: pos ? 1 : 0 }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
