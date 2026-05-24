import { useEffect, useRef, useState } from "react";
import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
import { inputCls } from "./styles";

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
 * Text input + "Insert variable" button. The button opens a small
 * dropdown listing every defined Variable; picking one splices its
 * `«name»` marker into the input at the current cursor position.
 * Templates resolve at render time via applyBindingToObject — see
 * lib/fnTemplate + lib/variableBinding.
 *
 * Used by Text and 1D-barcode properties panels in place of the
 * plain input so non-technical users can compose multi-variable
 * fields without typing the marker syntax by hand.
 */
export function TemplateContentInput({
  value,
  onChange,
  sanitise,
  placeholder,
  maxLength,
}: Props) {
  const t = useT();
  const variables = useLabelStore((s) => s.variables);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // Click-outside + Esc close. Mounted only while open so the
  // listeners don't fire for every other open menu in the panel.
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

  const insertMarker = (name: string) => {
    const input = inputRef.current;
    const marker = `«${name}»`;
    const cursor = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? cursor;
    const next = value.slice(0, cursor) + marker + value.slice(end);
    onChange(next);
    setOpen(false);
    // Restore focus + place cursor right after the inserted marker.
    queueMicrotask(() => {
      if (!input) return;
      const pos = cursor + marker.length;
      input.focus();
      input.setSelectionRange(pos, pos);
    });
  };

  return (
    <div ref={rootRef} className="relative flex gap-1">
      <input
        ref={inputRef}
        className={`${inputCls} flex-1`}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(sanitise ? sanitise(e.target.value) : e.target.value)}
      />
      <button
        type="button"
        className="px-2 rounded border border-border bg-surface-2 text-xs font-mono text-muted hover:text-text hover:border-accent transition-colors"
        title={t.app.insertVariable}
        disabled={variables.length === 0}
        onClick={() => setOpen((o) => !o)}
      >
        {"{x}"}
      </button>
      {open && variables.length > 0 && (
        <div
          className="absolute right-0 top-full mt-1 z-10 min-w-[8rem] max-h-48 overflow-y-auto rounded border border-border bg-surface shadow-lg"
          role="menu"
        >
          {variables.map((v) => (
            <button
              key={v.id}
              type="button"
              className="block w-full text-left px-2 py-1 text-xs font-mono text-text hover:bg-surface-2 transition-colors"
              onClick={() => insertMarker(v.name)}
            >
              «{v.name}»
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
