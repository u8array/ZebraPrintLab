import { useLabelStore } from '../../store/labelStore';
import { inputCls } from './styles';
import { FieldLabel } from './ZplCmd';
import { mmToUnit, unitToMm, unitLabel, unitStep } from '../../lib/units';
import { dotsToMm, mmToDots } from '../../lib/coordinates';

interface UnitNumberInputProps {
  label: string;
  /** Stored value, in dots. */
  valueDots: number;
  onChangeDots: (next: number) => void;
  /** Minimum, in dots (clamped after conversion). */
  minDots?: number;
  /** Maximum, in dots (clamped after conversion). */
  maxDots?: number;
  disabled?: boolean;
  zplCmd?: string;
  /** Replaces the cell layout (e.g. fieldGridCell); omit for the default column. */
  className?: string;
}

/**
 * Number input for a physical length stored in dots but shown/edited in the
 * active unit (mm/cm/in), so every size field reads in the same unit as the
 * X/Y position and label dimensions. The `(unit)` suffix is appended to the
 * label; the value never leaves the store as anything but dots.
 */
export function UnitNumberInput({
  label,
  valueDots,
  onChangeDots,
  minDots,
  maxDots,
  disabled,
  zplCmd,
  className,
}: UnitNumberInputProps) {
  const unit = useLabelStore((s) => s.canvasSettings.unit);
  const dpmm = useLabelStore((s) => s.label.dpmm);
  const toUnit = (dots: number) => mmToUnit(dotsToMm(dots, dpmm), unit);
  return (
    <div className={className ?? 'flex flex-col gap-1'}>
      <FieldLabel cmd={zplCmd}>{`${label} (${unitLabel(unit)})`}</FieldLabel>
      <input
        type="number"
        className={inputCls}
        value={toUnit(valueDots)}
        min={minDots !== undefined ? toUnit(minDots) : undefined}
        max={maxDots !== undefined ? toUnit(maxDots) : undefined}
        step={unitStep(unit)}
        disabled={disabled}
        onChange={(e) => {
          let dots = mmToDots(unitToMm(Number(e.target.value), unit), dpmm);
          if (isNaN(dots)) return;
          if (minDots !== undefined && dots < minDots) dots = minDots;
          if (maxDots !== undefined && dots > maxDots) dots = maxDots;
          onChangeDots(Math.round(dots));
        }}
      />
    </div>
  );
}
