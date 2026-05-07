import { clampMin } from '../../lib/inputParse';
import { inputCls, labelCls } from './styles';

interface NumberInputProps {
  label: string;
  value: number;
  /** When set, the change handler receives a value clamped to at least `min`,
   *  guarding against the empty/0 input collapse that bare Number() invites. */
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
}

/**
 * Standard label + number input pair used by registry properties panels.
 * Centralises the layout, the labelCls/inputCls coupling, and the
 * empty-or-NaN-to-min sanitisation so individual registries don't repeat
 * the boilerplate.
 */
export function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  readOnly,
}: NumberInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className={labelCls}>{label}</label>
      <input
        type="number"
        className={inputCls}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(e) => {
          const next =
            min !== undefined
              ? clampMin(e.target.value, min)
              : Number(e.target.value);
          onChange(next);
        }}
      />
    </div>
  );
}
