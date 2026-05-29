import { useId, type ReactNode } from "react";
import { labelCls, inputCls } from "../ui/formStyles";
import { clampBoundedInt, readBoundedInt } from "../../lib/inputParse";

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

/** Bare bounded-int `<input>` plus the asymmetric edit/commit clamp
 *  pair: `readBoundedInt` caps only the upper bound during typing so
 *  the user can transit through non-negative values below `min`
 *  (e.g. type "1" on the way to "12" when min=2). `onBlur` pulls the
 *  committed value back into the full `[min, max]` range. Shared by
 *  `ZplBoundedIntInput` (full ZPL-tag row) and grid-cell wrappers
 *  that share one parent tag (^PR triple, ^MD pair). Keeping the
 *  pair colocated avoids the two callers drifting on future fixes
 *  (e.g. the gemini-review onBlur addition). */
export function BoundedIntControl({
  id,
  min,
  max,
  value,
  onChange,
}: {
  id?: string;
  min: number;
  max: number;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
}) {
  return (
    <input
      id={id}
      type="number"
      className={inputCls}
      min={min}
      max={max}
      value={value ?? ""}
      onChange={(e) => onChange(readBoundedInt(e.target.value, min, max))}
      onBlur={(e) => onChange(clampBoundedInt(e.target.value, min, max))}
    />
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
