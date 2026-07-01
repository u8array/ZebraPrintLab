import { useT } from '../lib/useT';
import { useLabelStore } from '../store/labelStore';
import { labelCls } from '../components/Properties/styles';
import { builderButtonCls } from '../components/ui/formStyles';
import { ZplCmd } from '../components/Properties/ZplCmd';

/** Opens the GS1 element-string builder for a field; disabled once the field is
 *  bound to a variable (the builder writes a literal). */
export function Gs1BuilderButton({ objId, bound }: { objId: string; bound: boolean }) {
  const t = useT();
  const openGs1Builder = useLabelStore((s) => s.openGs1Builder);
  return (
    <button type="button" disabled={bound} onClick={() => openGs1Builder(objId)} className={builderButtonCls}>
      {t.gs1builder.button}
    </button>
  );
}

/** GS1-mode checkbox row with the symbology's command tag. */
export function Gs1ModeToggle({
  checked,
  onChange,
  label,
  cmd,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  cmd: string;
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
        <span className={labelCls}>{label}</span>
      </label>
      <ZplCmd cmd={cmd} />
    </div>
  );
}
