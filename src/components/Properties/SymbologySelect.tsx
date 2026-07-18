import { useLabelStore } from '../../store/labelStore';
import { useT } from '../../hooks/useT';
import { Select, type SelectGroup } from '../ui/Select';
import { symbologyGroupsFor } from '../Palette/paletteGroups';
import { convertSymbologyMapper, type SymbologyTarget } from '../../lib/symbologySwitch';
import type { LeafType } from '@zplab/core/registry';
import type { LabelObjectBase } from '@zplab/core/types/LabelObject';

/** Panel-header symbology switcher: shows the current barcode type and converts
 *  in place on selection (content + rotation survive, see convertSymbologyMapper).
 *  Options come from the shared symbologyTargets core, so disabled state and
 *  reason match the context menu. */
export function SymbologySelect({
  obj,
  targets,
  locked,
}: {
  obj: LabelObjectBase;
  targets: SymbologyTarget[];
  /** Own or ancestor lock: convertObjectType refuses both. */
  locked: boolean;
}) {
  const t = useT();
  const convertObjectType = useLabelStore((s) => s.convertObjectType);
  const groups: SelectGroup<string>[] = symbologyGroupsFor(targets, t).map((g) => ({
    label: g.label,
    options: g.types.map((s) => ({
      value: s.type as string,
      label: s.label,
      disabled: s.disabled,
      tooltip: s.tooltip,
    })),
  }));
  return (
    <div className="flex-1 min-w-0">
      <Select
        value={obj.type}
        onChange={(type) => convertObjectType(obj.id, convertSymbologyMapper(type as LeafType))}
        groups={groups}
        disabled={locked}
        aria-label={t.registry.symbologySwitch.label}
      />
    </div>
  );
}
