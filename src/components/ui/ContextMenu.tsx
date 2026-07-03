import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { useDismiss } from "../../hooks/useDismiss";

/** One context-menu entry. `labelKey` resolves against the caller's `labels`
 *  map; a raw `label` overrides it (dynamic entries). A `submenu` makes it a
 *  parent row. */
export interface MenuAction {
  id: string;
  labelKey?: string;
  label?: string;
  run?: () => void;
  disabled?: boolean;
  danger?: boolean;
  submenu?: MenuAction[];
}

/** Actions are grouped into divider-separated sections. */
export interface MenuSection {
  id: string;
  items: MenuAction[];
}

type IconType = React.ComponentType<{ className?: string }>;

interface Props {
  sections: MenuSection[];
  /** Viewport coords to open at (right-click point or an anchor corner). */
  x: number;
  y: number;
  /** Resolved labels for `labelKey` entries; `label` entries need none. */
  labels?: Record<string, string>;
  /** Icon per action; consumer-owned so the menu model stays pure data. */
  iconFor?: (item: MenuAction) => IconType | undefined;
  onClose: () => void;
}

const MENU_BOX =
  "z-[60] min-w-44 bg-surface border border-border rounded-lg shadow-2xl p-1";

function labelOf(item: MenuAction, labels?: Record<string, string>): string {
  return item.label ?? (item.labelKey ? labels?.[item.labelKey] ?? item.labelKey : item.id);
}

function RowIcon({ icon: Icon }: { icon?: IconType }) {
  return Icon ? <Icon className="w-4 h-4 shrink-0" /> : null;
}

function Row({
  item,
  labels,
  iconFor,
  onClose,
}: {
  item: MenuAction;
  labels?: Record<string, string>;
  iconFor?: (item: MenuAction) => IconType | undefined;
  onClose: () => void;
}) {
  const [subOpen, setSubOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  // Submenus open to the right by default; flip left and/or shift up once the
  // real size is known so a nested level can't run off the viewport.
  const [flip, setFlip] = useState<{ left: boolean; up: number }>({ left: false, up: 0 });
  const cls = `w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono rounded transition-colors ${
    item.disabled
      ? "text-muted/40 cursor-not-allowed"
      : item.danger
        ? "text-text hover:bg-error/15 hover:text-error"
        : "text-text hover:bg-surface-2"
  }`;

  useLayoutEffect(() => {
    if (!subOpen) return;
    const wrap = wrapRef.current;
    const sub = subRef.current;
    if (!wrap || !sub) return;
    const wr = wrap.getBoundingClientRect();
    const sr = sub.getBoundingClientRect();
    const overBottom = sr.bottom + 4 - window.innerHeight;
    setFlip({
      left: wr.right + sr.width + 4 > window.innerWidth,
      up: overBottom > 0 ? overBottom : 0,
    });
  }, [subOpen]);

  const submenu = item.submenu;
  if (submenu?.length) {
    return (
      <div
        ref={wrapRef}
        className="relative"
        onMouseEnter={() => !item.disabled && setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <button disabled={item.disabled} className={cls}>
          <RowIcon icon={iconFor?.(item)} />
          <span className="flex-1">{labelOf(item, labels)}</span>
          <ChevronRightIcon className="w-3.5 h-3.5 text-muted shrink-0" />
        </button>
        {subOpen && (
          <div
            ref={subRef}
            className={`absolute top-0 ${flip.left ? "right-full mr-0.5" : "left-full ml-0.5"} ${MENU_BOX}`}
            style={flip.up ? { transform: `translateY(-${flip.up}px)` } : undefined}
          >
            {submenu.map((s) => (
              <Row key={s.id} item={s} labels={labels} iconFor={iconFor} onClose={onClose} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      disabled={item.disabled}
      className={cls}
      onClick={() => {
        if (item.disabled) return;
        item.run?.();
        onClose();
      }}
    >
      <RowIcon icon={iconFor?.(item)} />
      <span className="flex-1">{labelOf(item, labels)}</span>
    </button>
  );
}

/** Pure view over `MenuSection[]`; builders stay data-only. */
export function ContextMenu({ sections, x, y, labels, iconFor, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Clamp into the viewport once the real size is known.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 4),
      y: Math.min(y, window.innerHeight - r.height - 4),
    });
  }, [x, y]);

  // Defer so the opening right-click's own pointer events don't self-close.
  useDismiss(ref, onClose, { defer: true });

  // Also dismiss on scroll (the fixed menu would detach from its anchor) and on
  // a context menu elsewhere (keyboard Menu key fires no pointerdown, so two
  // could otherwise stack). Mounted after the opening event, so it isn't caught.
  // onClose via ref so an inline callback doesn't re-bind the listeners.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onCloseRef.current();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("contextmenu", close, true);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("contextmenu", close, true);
    };
  }, []);

  return createPortal(
    <div ref={ref} className={`fixed ${MENU_BOX}`} style={{ left: pos.x, top: pos.y }} role="menu">
      {sections.map((section, i) => (
        <div key={section.id}>
          {i > 0 && <div className="my-1 border-t border-border" />}
          {section.items.map((item) => (
            <Row key={item.id} item={item} labels={labels} iconFor={iconFor} onClose={onClose} />
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}
