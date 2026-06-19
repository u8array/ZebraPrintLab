/**
 * Segmented button group for small enums (the three-tier rule's "≤3-4 options"
 * tier). Replaces a `<select>` so the choice is one click and the active value
 * is obvious. `defaultLabel`, when set, adds a leading segment that selects
 * `undefined` (the "use printer default / unset" state).
 */
interface SegmentedControlProps<T extends string> {
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  options: { value: T; label: string }[];
  /** When provided, a leading segment selects `undefined` (unset/default). */
  defaultLabel?: string;
  'aria-label'?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  defaultLabel,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const segments: { value: T | undefined; label: string }[] =
    defaultLabel !== undefined
      ? [{ value: undefined, label: defaultLabel }, ...options]
      : options;
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-1">
      {segments.map((seg) => {
        const active = value === seg.value;
        return (
          <button
            key={seg.value ?? '__default'}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(seg.value)}
            className={`flex-1 px-2 py-1 rounded border text-xs transition-colors ${
              active
                ? 'border-accent bg-accent-dim text-accent'
                : 'border-border text-muted hover:text-text hover:bg-surface-2'
            }`}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
