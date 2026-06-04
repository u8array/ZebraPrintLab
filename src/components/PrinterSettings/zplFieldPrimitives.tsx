import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
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

/** Text input with a local draft so a sanitiser-rejected commit can't
 *  cause a controlled-input revert (frozen-field UX). Default sanitiser
 *  strips Setup-Script-unsafe chars. IME-safe: during composition the
 *  raw value lives in the draft only, sanitise and commit run on
 *  compositionend. External value changes reseed the draft via
 *  adjust-state-during-render. */
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
} & Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "id" | "value" | "onChange" | "onInput" | "defaultValue" | "type"
  >) {
  const [draft, setDraft] = useState(value);
  const [lastExternal, setLastExternal] = useState(value);
  const [composing, setComposing] = useState(false);
  if (lastExternal !== value) {
    setLastExternal(value);
    setDraft(value);
  }
  return (
    <input
      {...rest}
      id={id}
      type="text"
      className={className ? `${inputCls} ${className}` : inputCls}
      value={draft}
      onCompositionStart={(e) => {
        setComposing(true);
        rest.onCompositionStart?.(e);
      }}
      onCompositionEnd={(e) => {
        setComposing(false);
        const next = sanitize(e.currentTarget.value);
        setDraft(next);
        onChange(next);
        rest.onCompositionEnd?.(e);
      }}
      onBlur={(e) => {
        setComposing(false);
        rest.onBlur?.(e);
      }}
      onChange={(e) => {
        if (composing) {
          setDraft(e.target.value);
          return;
        }
        const next = sanitize(e.target.value);
        setDraft(next);
        onChange(next);
      }}
    />
  );
}

/** Bounded-int `<input>` with a local-draft buffer for intermediate
 *  states (empty field, sub-min digits) the schema would reject.
 *  Commits on keystroke when `[min, max]`; on blur, clamps into range.
 *  External value changes reseed the draft via adjust-state-during-render.
 *
 *  `required`: empty blur on an optional field emits `undefined` (clear);
 *  on a required field, snaps the draft back to the last committed value
 *  with no patch, keeping the input in sync with the store. */
export function BoundedIntControl({
  id,
  min,
  max,
  value,
  onChange,
  disabled,
  required,
}: {
  id?: string;
  min: number;
  max: number;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const externalText = value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(externalText);
  const [lastExternal, setLastExternal] = useState(externalText);
  // adjust-state-during-render: external store value (undo, reset,
  // sibling edit) reseeds the draft.
  if (lastExternal !== externalText) {
    setLastExternal(externalText);
    setDraft(externalText);
  }
  return (
    <input
      id={id}
      type="number"
      className={inputCls}
      min={min}
      max={max}
      value={draft}
      disabled={disabled}
      // Tells screen-reader users the field can't be cleared. Pairs
      // with the snap-back behaviour on empty blur.
      aria-required={required || undefined}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = readBoundedInt(raw, min, max);
        // Only commit when the parsed value passes the schema range
        // (raw==="" → undefined; sub-min digits stay in the draft).
        if (parsed !== undefined && parsed >= min) onChange(parsed);
      }}
      onBlur={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          if (required) {
            // Snap back to the last committed value so the input
            // doesn't desync from the store after a rejected clear.
            setDraft(lastExternal);
            return;
          }
          onChange(undefined);
          return;
        }
        const clamped = clampBoundedInt(raw, min, max);
        if (clamped !== undefined) {
          setDraft(String(clamped));
          onChange(clamped);
        }
      }}
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
