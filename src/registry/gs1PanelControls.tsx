import { useT } from '../lib/useT';
import { useLabelStore } from '../store/labelStore';
import { builderButtonCls } from '../components/ui/formStyles';

/** Opens the GS1 element-string builder. Always enabled: the builder
 *  round-trips «marker» content, and content it can't load as segments gets
 *  an in-modal warning rather than a blocked entry point. */
export function Gs1BuilderButton({ objId }: { objId: string }) {
  const t = useT();
  const openGs1Builder = useLabelStore((s) => s.openGs1Builder);
  return (
    <button type="button" onClick={() => openGs1Builder(objId)} className={builderButtonCls}>
      {t.gs1builder.button}
    </button>
  );
}
