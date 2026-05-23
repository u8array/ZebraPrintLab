import {
  ExclamationTriangleIcon,
  MinusIcon,
  TableCellsIcon,
} from '@heroicons/react/16/solid';
import type { VariableSource } from '../../lib/variableBinding';

interface Props {
  source: VariableSource;
  /** Optional: header name a `csv` or `orphan` source is bound to.
   *  Surfaced in the tooltip so the user sees which column the
   *  variable feeds from without opening the mapping modal. */
  boundHeader?: string;
  /** Visual size. `xs` for tight contexts (mapping modal rows);
   *  `sm` for the Variables-panel rows where there's a bit more
   *  vertical room. */
  size?: 'xs' | 'sm';
}

/* i18n: Phase-2 strings here get locale keys at end-of-branch sweep. */
const COPY: Record<VariableSource, { label: string; tipFmt: string }> = {
  csv: {
    label: 'CSV',
    tipFmt: 'Value comes from CSV column "{header}".',
  },
  orphan: {
    label: 'orphan',
    tipFmt: 'Mapped to "{header}" — that column is not in the current CSV. Renders defaultValue.',
  },
  default: {
    label: 'default',
    tipFmt: 'Not mapped to a CSV column. Renders defaultValue.',
  },
};

/** Universal source indicator for a Variable. Same component appears
 *  in the Variables panel, the mapping modal, and (later) the canvas
 *  selection HUD so the user learns one visual vocabulary for
 *  "where is this value coming from?". */
export function VariableSourceBadge({ source, boundHeader, size = 'sm' }: Props) {
  const cls =
    source === 'csv'
      ? 'text-muted'
      : source === 'orphan'
        ? 'text-amber-400'
        : 'text-muted/60';
  const iconSize = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const Icon =
    source === 'csv'
      ? TableCellsIcon
      : source === 'orphan'
        ? ExclamationTriangleIcon
        : MinusIcon;
  const tip = COPY[source].tipFmt.replace('{header}', boundHeader ?? '');
  return (
    <span
      title={tip}
      aria-label={COPY[source].label}
      className={`inline-flex items-center justify-center ${cls}`}
    >
      <Icon className={iconSize} />
    </span>
  );
}
