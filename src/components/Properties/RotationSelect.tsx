import { ZPL_ROTATIONS, isZplRotation, type ZplRotation } from '../../registry/rotation';
import { useT } from '../../lib/useT';
import { inputCls, labelCls } from './styles';

interface Props {
  value: ZplRotation;
  onChange: (next: ZplRotation) => void;
}

export function RotationSelect({ value, onChange }: Props) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1">
      <label className={labelCls}>{t.registry.text.rotation}</label>
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
