import type { ReactNode } from "react";
import { useT } from "../../lib/useT";
import { labelCls } from "./styles";
import { NumberInput } from "./NumberInput";
import type { TextProps } from "../../registry/text";

type FpDir = NonNullable<TextProps["fpDirection"]>;

interface Props {
  props: TextProps;
  onChange: (patch: Partial<TextProps>) => void;
}

/** SVG glyphs for the three ^FP direction modes. `currentColor`
 *  inherits the active/inactive button colour so theme + selection
 *  state drive the icon without per-icon styling. */
const ICONS: Record<FpDir, ReactNode> = {
  H: (
    <svg viewBox="0 0 16 12" className="w-4 h-3 mx-auto" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="6" x2="14" y2="6" />
      <polyline points="11,3 14,6 11,9" fill="none" />
    </svg>
  ),
  V: (
    <svg viewBox="0 0 16 12" className="w-4 h-3 mx-auto" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="8" y1="1" x2="8" y2="11" />
      <polyline points="5,8 8,11 11,8" fill="none" />
    </svg>
  ),
  R: (
    <svg viewBox="0 0 16 12" className="w-4 h-3 mx-auto" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="6" x2="14" y2="6" />
      <polyline points="5,3 2,6 5,9" fill="none" />
    </svg>
  ),
};

/** ^FP direction + gap sub-panel: horizontal / vertical-stack /
 *  reverse-order with an inter-character gap. Niche feature (CJK /
 *  RTL typography); collapsed behind the parent panel's disclosure
 *  so it doesn't crowd the common case. */
export function FpSettings({ props: p, onChange }: Props) {
  const t = useT();
  const dir = p.fpDirection ?? "H";
  const items: { v: FpDir; title: string }[] = [
    { v: "H", title: t.registry.text.fpDirH },
    { v: "V", title: t.registry.text.fpDirV },
    { v: "R", title: t.registry.text.fpDirR },
  ];
  const onDirChange = (next: FpDir) => {
    // 'H' with zero gap is the unset state; drop the prop so the
    // generator stops emitting ^FP and the round-trip stays clean.
    onChange({ fpDirection: next === "H" ? undefined : next });
  };
  return (
    <div className="pl-3 border-l border-border flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <label className={labelCls}>{t.registry.text.fpDirection}</label>
        <div className="flex gap-1" role="group" aria-label={t.registry.text.fpDirection}>
          {items.map(({ v, title }) => {
            const active = dir === v;
            return (
              <button
                key={v}
                type="button"
                title={title}
                aria-label={title}
                aria-pressed={active}
                onClick={() => onDirChange(v)}
                className={`w-7 h-6 flex items-center justify-center rounded border transition-colors ${
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
      </div>
      <div className="w-1/2 pr-1">
        <NumberInput
          label={t.registry.text.fpCharGap}
          value={p.fpCharGap ?? 0}
          min={0}
          onChange={(fpCharGap) =>
            onChange({ fpCharGap: fpCharGap > 0 ? fpCharGap : undefined })
          }
        />
      </div>
    </div>
  );
}
