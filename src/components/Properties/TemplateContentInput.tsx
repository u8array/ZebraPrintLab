import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
import { CLOCK_TOKEN_LABELS } from "../../lib/fcTemplate";
import { tokeniseMarkers } from "../../lib/markerTokens";
import type { Variable } from "../../types/Variable";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Optional sanitiser for restricted-charset fields (e.g. numeric-only
   *  barcodes). Applied to typed input only — template markers are
   *  inserted verbatim regardless. */
  sanitise?: (raw: string) => string;
  placeholder?: string;
  maxLength?: number;
}

/**
 * Multi-line content editor for bindable fields. Renders a textarea
 * over a colour-mirror layer that highlights `«…»` markers in their
 * type-specific colour (variable = accent, clock = cyan). Cursor and
 * selection come from the native textarea; the mirror is purely
 * visual.
 *
 * The textarea auto-grows from 1 to MAX_ROWS as content wraps or
 * gains newlines. Newlines round-trip via the existing ^FB / `\&`
 * mechanism in the parser/generator — outside a ^FB block they emit
 * literally and are ignored by Zebra firmware, which is the spec-
 * correct fallback.
 *
 * The `{x}` button opens a dropdown listing every defined Variable
 * plus the canonical clock tokens; picking either splices the marker
 * into the textarea at the cursor.
 */
const MIN_ROWS = 2;
const MAX_ROWS = 8;
const LINE_HEIGHT_PX = 20; // text-xs leading-5 ⇒ 20px
// Shared geometry between textarea + mirror. Any visual delta here
// causes per-char misalignment of the highlight against the cursor.
// pr-7 reserves room for the absolute `{x}` button in the top-right
// so first-line content doesn't slide under it.
const SHARED_CLS =
  "w-full bg-surface-2 border border-border rounded pl-2 pr-7 py-1 text-xs font-mono leading-5 whitespace-pre-wrap break-words";

export function TemplateContentInput({
  value,
  onChange,
  sanitise,
  placeholder,
  maxLength,
}: Props) {
  const t = useT();
  const variables = useLabelStore((s) => s.variables);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const variableNames = useMemo(
    () => new Set(variables.map((v: Variable) => v.name)),
    [variables],
  );
  const segments = useMemo(
    () => tokeniseMarkers(value, variableNames),
    [value, variableNames],
  );

  // Auto-grow from MIN_ROWS up to MAX_ROWS based on actual rendered
  // height (so visual word-wrap counts, not just \n count). Mirror
  // matches the textarea exactly so the highlight layer stays
  // aligned at every grow step.
  useLayoutEffect(() => {
    const ta = taRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;
    ta.style.height = "auto"; // reset so scrollHeight reflects content
    const minH = MIN_ROWS * LINE_HEIGHT_PX + 8; // +8 = 2× py-1 padding
    const maxH = MAX_ROWS * LINE_HEIGHT_PX + 8;
    const h = Math.min(maxH, Math.max(minH, ta.scrollHeight));
    ta.style.height = `${h}px`;
    mirror.style.height = `${h}px`;
  }, [value]);

  // Click-outside + Esc close. Mounted only while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const insertMarker = (markerBody: string) => {
    const ta = taRef.current;
    const marker = `«${markerBody}»`;
    const cursor = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? cursor;
    const next = value.slice(0, cursor) + marker + value.slice(end);
    onChange(next);
    setOpen(false);
    queueMicrotask(() => {
      if (!ta) return;
      const pos = cursor + marker.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const syncScroll = () => {
    const ta = taRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;
    mirror.scrollTop = ta.scrollTop;
    mirror.scrollLeft = ta.scrollLeft;
  };

  return (
    <div ref={rootRef} className="relative">
      {/* Visual layer: same geometry as the textarea, coloured marker
          spans. Hidden from a11y so the screen-reader gets the
          textarea value only. */}
      <div
        ref={mirrorRef}
        className={`${SHARED_CLS} absolute inset-0 overflow-hidden pointer-events-none text-text`}
        aria-hidden
      >
        {segments.map((s, i) =>
          s.kind === "text" ? (
            <span key={i}>{s.text}</span>
          ) : s.kind === "var" ? (
            <span key={i} className="text-accent">{s.text}</span>
          ) : s.kind === "clock" ? (
            <span key={i} className="text-info">{s.text}</span>
          ) : (
            <span key={i} className="text-error underline decoration-wavy decoration-error/60">{s.text}</span>
          ),
        )}
        {value.endsWith("\n") ? " " : ""}
      </div>
      <textarea
        ref={taRef}
        // overflow-y-auto so content beyond MAX_ROWS stays reachable;
        // scrollbar visually hidden because the mirror layer doesn't
        // reserve space for one — a visible scrollbar would shift the
        // textarea's text origin and misalign the colour highlight.
        // Wheel + keyboard scrolling stay functional via syncScroll.
        className={`${SHARED_CLS} relative block resize-none overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden caret-text focus:border-accent focus:outline-none`}
        style={{ color: "transparent", background: "transparent" }}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(sanitise ? sanitise(e.target.value) : e.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
      />
      {/* Button floats inside the textarea's top-right corner so the
          input keeps the full panel width. Subtle background so it
          stays legible when textarea content runs under it. */}
      <button
        type="button"
        className="absolute top-1 right-1 px-1.5 rounded text-[10px] font-mono bg-surface border border-border text-muted hover:text-text hover:border-accent transition-colors"
        title={t.app.insertVariable}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {"{x}"}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-10 min-w-[10rem] max-h-64 overflow-y-auto rounded border border-border bg-surface shadow-lg"
          role="menu"
        >
          {variables.length > 0 && (
            <>
              {variables.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="block w-full text-left px-2 py-1 text-xs font-mono text-accent hover:bg-surface-2 transition-colors"
                  onClick={() => insertMarker(v.name)}
                >
                  «{v.name}»
                </button>
              ))}
              <div className="border-t border-border my-1" />
            </>
          )}
          {CLOCK_TOKEN_LABELS.map(({ token, labelKey }) => (
            <button
              key={token}
              type="button"
              className="block w-full text-left px-2 py-1 text-xs font-mono text-text hover:bg-surface-2 transition-colors"
              onClick={() => insertMarker(`clock:${token}`)}
            >
              <span className="text-info">«clock:{token}»</span>{" "}
              <span className="text-muted">{t.app[labelKey]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
