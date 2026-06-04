import { useId, useRef, type InputHTMLAttributes, type ReactNode } from "react";
import { labelCls, inputCls } from "../ui/formStyles";
import { clampBoundedInt, readBoundedInt } from "../../lib/inputParse";
import { stripUnsafeChars } from "../../types/PrinterProfile";

/** Shared muted-monospace class for ZPL command tags so the visual
 *  weight stays identical across the label-row, checkbox-row and
 *  any future field primitives that dock a tag rightwards. */
const commandTagCls = "font-mono text-[10px] text-muted/60 tracking-tight";

/** Field label with a ghost-rendered ZPL command tag docked right.
 *  The distinctive design move of the printer-settings modal: users
 *  see exactly which command each control emits, turning the modal
 *  into a discoverable spec reference without crowding the form.
 *  Density matches the Properties Panel's `labelCls`. */
export function ZplCommandLabel({
  text,
  command,
  htmlFor,
}: {
  text: string;
  command: string;
  htmlFor?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className={labelCls}>
        {text}
      </label>
      <span className={commandTagCls}>{command}</span>
    </div>
  );
}

/** Checkbox row with the same ZPL-command-docked-right treatment as
 *  `ZplCommandLabel`. The command tag sits outside the `<label>` so
 *  clicking it does not toggle the checkbox; the user can still read
 *  the spec hint without changing state. */
export function ZplCheckbox({
  text,
  command,
  checked,
  onChange,
}: {
  text: string;
  command: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="accent-accent"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="text-xs text-text">{text}</span>
      </label>
      <span className={commandTagCls}>{command}</span>
    </div>
  );
}

/** Wrapper for a field row to give it consistent vertical spacing.
 *  Children are the label (via ZplCommandLabel) and the control. */
export function ZplField({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

/** Labelled-cell wrapper for grid slots that share one parent ZPL
 *  tag across multiple positional params (^PR triple, ^MF pair).
 *  Renders only the per-slot `<label>` (the ZPL tag lives at the
 *  parent ZplField) and pipes a `useId`-generated id to the child
 *  control via a render prop so the `htmlFor` link is correct
 *  without making callers manage ids manually. */
export function ZplSubField({
  label,
  children,
}: {
  label: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/** Text input that runs a sanitiser before the value reaches the
 *  store, so a schema-rejected char never causes a silent rollback
 *  (frozen-field UX). Default sanitiser strips Setup-Script-unsafe
 *  chars; pass `sanitize` for other regimes.
 *
 *  IME composition (CJK/Korean) is gated via real `compositionstart`/
 *  `compositionend` events so the sanitiser doesn't fire mid-session
 *  and desync the composition buffer. The caret jumps to end after a
 *  mid-string strip (accepted trade-off for simplicity over the
 *  caret-preservation gymnastics that subtle bugs invited). */
export function SafeStringInput({
  id,
  value,
  onChange,
  sanitize = stripUnsafeChars,
  className,
  ...rest
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  sanitize?: (raw: string) => string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange" | "type">) {
  const composing = useRef(false);
  return (
    <input
      {...rest}
      id={id}
      type="text"
      // Always include `inputCls`; the caller's `className` appends so
      // overrides don't have to re-spell the base class.
      className={className ? `${inputCls} ${className}` : inputCls}
      value={value}
      onCompositionStart={(e) => {
        composing.current = true;
        rest.onCompositionStart?.(e);
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        // Sanitise here as a safety net for browsers that don't dispatch
        // the trailing `input` event after `compositionend` (older Safari,
        // some Android IMEs). The follow-up `input` (when it fires) runs
        // sanitise on the same value, which is idempotent.
        onChange(sanitize(e.currentTarget.value));
        rest.onCompositionEnd?.(e);
      }}
      onBlur={(e) => {
        // Blur can fire mid-composition (focus stolen / user clicks
        // away) without a preceding `compositionend`. Reset the flag
        // so the next focus session starts clean.
        composing.current = false;
        rest.onBlur?.(e);
      }}
      onChange={(e) => {
        if (composing.current) {
          // Raw mid-composition value goes through; schema is permissive
          // enough for CJK chars (the unsafe class is ^/~/,/control
          // only). A user explicitly typing an unsafe char via IME is
          // the rare frozen-field scenario worth a follow-up.
          onChange(e.target.value);
          return;
        }
        onChange(sanitize(e.target.value));
      }}
    />
  );
}

/** Bare bounded-int `<input>` plus the asymmetric edit/commit clamp
 *  pair: `readBoundedInt` caps only the upper bound during typing so
 *  the user can transit through non-negative values below `min`
 *  (e.g. type "1" on the way to "12" when min=2). `onBlur` pulls the
 *  committed value back into the full `[min, max]` range. Shared by
 *  `ZplBoundedIntInput` (full ZPL-tag row) and grid-cell wrappers
 *  that share one parent tag (^PR triple, ^MD pair). */
export function BoundedIntControl({
  id,
  min,
  max,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  min: number;
  max: number;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      type="number"
      className={inputCls}
      min={min}
      max={max}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(readBoundedInt(e.target.value, min, max))}
      onBlur={(e) => onChange(clampBoundedInt(e.target.value, min, max))}
    />
  );
}

/** Inner enum-backed select for grids that share one parent ZPL
 *  tag across multiple positional params (^MF pair, ^SL mode +
 *  language). Same input shape as `ZplEnumSelect` minus the
 *  `command` tag — the tag lives at the parent `ZplField` so
 *  duplicating it on each sub-row would visually suggest two
 *  separate commands. */
export function ZplEnumSubSelect<T extends string>({
  label,
  values,
  isValid,
  value,
  onChange,
  defaultLabel,
  optionLabel,
}: {
  label: string;
  values: readonly T[];
  isValid: (v: string) => v is T;
  value: T | undefined;
  onChange: (next: T | undefined) => void;
  defaultLabel: string;
  optionLabel: (v: T) => string;
}) {
  return (
    <ZplSubField label={label}>
      {(id) => (
        <select
          id={id}
          className={inputCls}
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(isValid(raw) ? raw : undefined);
          }}
        >
          <option value="">{defaultLabel}</option>
          {values.map((v) => (
            <option key={v} value={v}>
              {optionLabel(v)}
            </option>
          ))}
        </select>
      )}
    </ZplSubField>
  );
}

/** Generic enum-backed select row: label + ZPL-tag header + select
 *  with a leading "default" placeholder. Replaces the hand-rolled
 *  select scaffolding in MediaFeedTab and PrintQualityTab so the
 *  enum-select pattern lives in one place. `optionLabel` returns
 *  the localised display string for each value; the value itself
 *  is rendered as the select option value. */
export function ZplEnumSelect<T extends string>({
  label,
  command,
  values,
  isValid,
  value,
  onChange,
  defaultLabel,
  optionLabel,
}: {
  label: string;
  command: string;
  values: readonly T[];
  isValid: (v: string) => v is T;
  value: T | undefined;
  onChange: (next: T | undefined) => void;
  defaultLabel: string;
  optionLabel: (v: T) => string;
}) {
  const id = useId();
  return (
    <ZplField>
      <ZplCommandLabel text={label} command={command} htmlFor={id} />
      <select
        id={id}
        className={inputCls}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(isValid(raw) ? raw : undefined);
        }}
      >
        <option value="">{defaultLabel}</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {optionLabel(v)}
          </option>
        ))}
      </select>
    </ZplField>
  );
}

/** Bounded-integer number input with the same ZPL-tag + label
 *  treatment as ZplEnumSelect. Optional `unit` renders as a muted
 *  suffix right of the (compact) input so short numbers don't
 *  stretch across the row. Centralises the readBoundedInt onChange
 *  + width treatment that was hand-rolled at every number field. */
export function ZplBoundedIntInput({
  label,
  command,
  min,
  max,
  value,
  onChange,
  unit,
}: {
  label: string;
  command: string;
  min: number;
  max: number;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  unit?: string;
}) {
  const id = useId();
  const inputBox = (
    <div className="w-32">
      <BoundedIntControl id={id} min={min} max={max} value={value} onChange={onChange} />
    </div>
  );
  return (
    <ZplField>
      <ZplCommandLabel text={label} command={command} htmlFor={id} />
      {unit
        ? (
          <div className="flex items-center gap-2">
            {inputBox}
            <span className={labelCls}>{unit}</span>
          </div>
        )
        : inputBox}
    </ZplField>
  );
}
