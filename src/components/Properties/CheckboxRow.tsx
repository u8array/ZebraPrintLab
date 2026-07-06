import { labelCls } from './styles';
import { ZplCmd } from './ZplCmd';

/** Checkbox row with the owning ZPL command tag on the right. */
export function CheckboxRow({
  checked,
  onChange,
  label,
  cmd,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  cmd: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className={`flex items-center gap-2 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          className="accent-accent"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className={labelCls}>{label}</span>
      </label>
      <ZplCmd cmd={cmd} />
    </div>
  );
}
