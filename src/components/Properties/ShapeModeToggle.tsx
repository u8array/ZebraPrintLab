import type { LabelObject } from '../../types/Group';
import type { LabelObjectBase } from '../../types/LabelObject';
import { useT } from '../../lib/useT';
import { useLabelStore } from '../../store/labelStore';
import { SegmentedControl } from '../ui/SegmentedControl';
import { canToggleShapeMode, oppositeShapeMode, toggleShapeMode } from '../../lib/lineBoxConvert';

/**
 * Compact Line | Box edit-mode toggle, sized for the section header. Both are
 * the same ^GB primitive, only the drag handles differ; switching converts the
 * object in place (one history entry). The target segment is disabled with a
 * tooltip when conversion would be lossy: a diagonal line (angle lost) or an
 * outline box (border/rounding lost).
 */
// Panels pass the open base shape (props is the type-specific P); the lib only
// reads type/props, so a single cast to the union at the seam is enough.
export function ShapeModeToggle({ obj: raw }: { obj: LabelObjectBase & { props: object } }) {
  const t = useT();
  const convertObjectType = useLabelStore((s) => s.convertObjectType);
  const obj = raw as LabelObject;
  const target = oppositeShapeMode(obj);
  const targetDisabled = !canToggleShapeMode(obj);
  const hint = obj.type === 'line' ? t.registry.shapeMode.diagonalHint : t.registry.shapeMode.outlineHint;

  const select = (mode: string | undefined) => {
    // Two segments, so any click on the non-active, enabled one means toggle.
    if (!mode || mode === obj.type || targetDisabled) return;
    convertObjectType(obj.id, toggleShapeMode);
  };

  const seg = (value: 'line' | 'box', label: string) => ({
    value,
    label,
    disabled: value === target && targetDisabled,
    tooltip: value === target && targetDisabled ? hint : undefined,
  });

  return (
    <div className="shrink-0">
      <SegmentedControl
        value={obj.type}
        onChange={select}
        aria-label={t.registry.shapeMode.label}
        options={[seg('line', t.registry.shapeMode.line), seg('box', t.registry.shapeMode.box)]}
      />
    </div>
  );
}
