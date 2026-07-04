import { useEffect, useLayoutEffect, useRef } from "react";
import { markerOf } from "../../types/Variable";
import { inputCls } from "../ui/formStyles";
import { MarkerInsertMenu } from "./MarkerInsertMenu";
import { TemplateContentInput, type TemplateEditorHandle } from "./TemplateContentInput";

/** Builder field with marker chips and a caret-anchored insert menu. Password
 *  mode falls back to a masked plain input (contenteditable can't mask):
 *  inserted tokens appear as masked chars with no chip affordance, a
 *  deliberate trade of token visibility for masking. */
export function MarkerTextField({
  value,
  onChange,
  multiline = false,
  password = false,
  id,
  ariaLabel,
  hasError,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  /** Masked input (WiFi password); renders without chips. */
  password?: boolean;
  id?: string;
  ariaLabel?: string;
  hasError?: boolean;
  /** Focus the editor on mount, for rows created by a user action. */
  autoFocus?: boolean;
}) {
  const editorRef = useRef<TemplateEditorHandle>(null);

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus]);

  if (password) {
    return (
      <PasswordMarkerField
        value={value}
        onChange={onChange}
        id={id}
        ariaLabel={ariaLabel}
        hasError={hasError}
        autoFocus={autoFocus}
      />
    );
  }

  return (
    <div className="flex items-start gap-1 flex-1 min-w-0">
      <div
        className={`flex-1 min-w-0 bg-surface-2 border rounded-md focus-within:border-accent ${
          hasError ? "border-error" : "border-border"
        }`}
      >
        <TemplateContentInput
          ref={editorRef}
          value={value}
          onChange={onChange}
          multiline={multiline}
          ariaLabel={ariaLabel}
          boxClassName={`w-full bg-transparent px-2 py-1 text-xs font-mono leading-6 break-words focus:outline-none ${
            multiline ? "min-h-16 whitespace-pre-wrap" : ""
          }`}
        />
      </div>
      <MarkerInsertMenu onInsert={(body) => editorRef.current?.insertMarker(body)} />
    </div>
  );
}

/** Masked variant: plain input plus insert menu; restores the caret after an
 *  insert, which a controlled re-render would otherwise push to the end. */
function PasswordMarkerField({
  value,
  onChange,
  id,
  ariaLabel,
  hasError,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  ariaLabel?: string;
  hasError?: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Caret to reapply once the controlled value has updated.
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    ref.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [value]);

  const insert = (body: string) => {
    const el = ref.current;
    const lo = el?.selectionStart ?? value.length;
    const hi = el?.selectionEnd ?? lo;
    const token = markerOf(body);
    const next = value.slice(0, lo) + token + value.slice(hi);
    const caret = lo + token.length;
    if (next === value) {
      // No value change means the [value] effect won't fire; move the caret now.
      el?.setSelectionRange(caret, caret);
    } else {
      pendingCaret.current = caret;
      onChange(next);
    }
  };

  return (
    <div className="flex items-start gap-1 flex-1">
      <input
        id={id}
        ref={ref}
        type="password"
        className={`${inputCls} flex-1 ${hasError ? "border-error" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
      />
      <MarkerInsertMenu onInsert={insert} />
    </div>
  );
}
