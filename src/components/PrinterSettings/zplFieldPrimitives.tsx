import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { labelCls, inputCls } from "../ui/formStyles";
import { clampBoundedInt, readBoundedInt } from "../../lib/inputParse";
import { stripUnsafeChars } from "../../types/PrinterProfile";

const commandTagCls = "font-mono text-[10px] text-muted/60 tracking-tight";
const hintCls = "font-mono text-[10px] text-muted/70 normal-case tracking-normal";

export function ZplFieldHint({ children }: { children: ReactNode }) {
  return <span className={hintCls}>{children}</span>;
}

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

/** Tag sits outside `<label>` so clicking it doesn't toggle. */
export function ZplCheckbox({
  text,
  command,
  checked,
  onChange,
  hint,
}: {
  text: string;
  command: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: ReactNode;
}) {
  const row = (
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
  if (hint === undefined) return row;
  return (
    <ZplField>
      {row}
      <ZplFieldHint>{hint}</ZplFieldHint>
    </ZplField>
  );
}

export function ZplField({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

/** Per-slot label for shared-tag grids (^PR, ^MF); pipes useId to child. */
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

/** Local draft prevents sanitiser-rejected revert (frozen-field UX);
 *  IME composition defers sanitise until compositionend. */
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

/** Required+empty blur snaps back to last committed; optional clears. */
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
      aria-required={required || undefined}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = readBoundedInt(raw, min, max);
        // Sub-min digits stay in the draft.
        if (parsed !== undefined && parsed >= min) onChange(parsed);
      }}
      onBlur={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          if (required) {
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

/** No command tag; lives at the shared parent ZplField. */
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

export function ZplEnumSelect<T extends string>({
  label,
  command,
  values,
  isValid,
  value,
  onChange,
  defaultLabel,
  optionLabel,
  hint,
}: {
  label: string;
  command: string;
  values: readonly T[];
  isValid: (v: string) => v is T;
  value: T | undefined;
  onChange: (next: T | undefined) => void;
  defaultLabel: string;
  optionLabel: (v: T) => string;
  hint?: ReactNode;
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
      {hint !== undefined && <ZplFieldHint>{hint}</ZplFieldHint>}
    </ZplField>
  );
}

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
