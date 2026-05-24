import type { ReactNode } from "react";
import { useT } from "../../lib/useT";
import type { TextProps } from "../../registry/text";

type Justify = NonNullable<TextProps["blockJustify"]>;

interface Props {
  value: Justify;
  onChange: (next: Justify) => void;
}

/** Inline SVG glyphs for the four justify modes. Stroke uses
 *  `currentColor` so the active/inactive button colour drives the
 *  icon — single source of truth for theming. Inline SVG (vs.
 *  Unicode glyphs) avoids font-fallback tofu on systems without the
 *  niche math/arrow ranges installed. */
const ICONS: Record<Justify, ReactNode> = {
  L: (
    <svg viewBox="0 0 16 12" className="w-4 h-3 mx-auto" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="2" x2="15" y2="2" />
      <line x1="1" y1="6" x2="11" y2="6" />
      <line x1="1" y1="10" x2="13" y2="10" />
    </svg>
  ),
  C: (
    <svg viewBox="0 0 16 12" className="w-4 h-3 mx-auto" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="2" x2="15" y2="2" />
      <line x1="3" y1="6" x2="13" y2="6" />
      <line x1="2" y1="10" x2="14" y2="10" />
    </svg>
  ),
  R: (
    <svg viewBox="0 0 16 12" className="w-4 h-3 mx-auto" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="2" x2="15" y2="2" />
      <line x1="5" y1="6" x2="15" y2="6" />
      <line x1="3" y1="10" x2="15" y2="10" />
    </svg>
  ),
  J: (
    <svg viewBox="0 0 16 12" className="w-4 h-3 mx-auto" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="2" x2="15" y2="2" />
      <line x1="1" y1="6" x2="15" y2="6" />
      <line x1="1" y1="10" x2="15" y2="10" />
    </svg>
  ),
};

/** ^FB text-justification toggle: 4 icon buttons (left / centre /
 *  right / justified) — same MS Word pattern users already know.
 *  Replaces the legacy `<select>` so picking takes a single click
 *  and the active mode is visually obvious at a glance. */
export function JustifyButtons({ value, onChange }: Props) {
  const t = useT();
  const items: { v: Justify; title: string }[] = [
    { v: "L", title: t.registry.text.justifyL },
    { v: "C", title: t.registry.text.justifyC },
    { v: "R", title: t.registry.text.justifyR },
    { v: "J", title: t.registry.text.justifyJ },
  ];
  return (
    <div className="flex gap-1" role="group" aria-label={t.registry.text.blockJustify}>
      {items.map(({ v, title }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={`flex-1 px-2 py-1 rounded border transition-colors ${
              active
                ? "border-accent bg-accent-dim text-accent"
                : "border-border text-muted hover:text-text hover:bg-surface-2"
            }`}
          >
            {ICONS[v]}
          </button>
        );
      })}
    </div>
  );
}
