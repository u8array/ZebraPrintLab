import { ZPL_ROTATIONS, isZplRotation, type ZplRotation } from '../../registry/rotation';
import { useT } from '../../lib/useT';
import { inputCls } from './styles';
import { FieldLabel } from './ZplCmd';

interface Props {
  value: ZplRotation;
  onChange: (next: ZplRotation) => void;
  /** Optional ZPL command this field emits; shown when showZplCommands is on. */
  zplCmd?: string;
}

export function RotationSelect({ value, onChange, zplCmd }: Props) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel cmd={zplCmd}>{t.registry.text.rotation}</FieldLabel>
      <select
        className={inputCls}
        value={value}
        onChange={(e) => isZplRotation(e.target.value) && onChange(e.target.value)}
      >
        {ZPL_ROTATIONS.map((r) => (
          <option key={r} value={r}>{t.registry.text[`rotation${r}`]}</option>
        ))}
      </select>
    </div>
  );
}
