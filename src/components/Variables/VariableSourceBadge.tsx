import {
  ExclamationTriangleIcon,
  MinusIcon,
  TableCellsIcon,
} from '@heroicons/react/16/solid';
import { useT } from '../../lib/useT';
import type { VariableSource } from '../../lib/variableBinding';

interface Props {
  source: VariableSource;
  /** Header name a `csv` or `orphan` source is bound to. Shown as
   *  inline text for csv/orphan so the user knows the column without
   *  hovering. Ignored for `default`. */
  boundHeader?: string;
  /** Visual size. `xs` for tight contexts (mapping modal rows);
   *  `sm` for the Variables-panel rows. */
  size?: 'xs' | 'sm';
  /** When false (default in modal rows), render icon only. When true,
   *  include the column name text; used in the Variables panel where
   *  the badge competes with bindings-count text and needs to win. */
  showLabel?: boolean;
}


/** Universal source indicator for a Variable. Same vocabulary in
 *  Variables panel + mapping modal rows. With `showLabel`, includes
 *  the bound column name inline so it stays informative even when
 *  sitting next to other status text. */
export function VariableSourceBadge({
  source,
  boundHeader,
  size = 'sm',
  showLabel = false,
}: Props) {
  const tv = useT().variables;
  const TIP: Record<VariableSource, string> = {
    csv: tv.csvSourceCsvTip,
    orphan: tv.csvSourceOrphanTip,
    default: tv.csvSourceDefaultTip,
  };
  const colorCls =
    source === 'csv'
      ? 'text-accent'
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
  const tip = TIP[source].replace('{header}', boundHeader ?? '');
  // Label uses bare 'orphan' / 'csv' when no header is known instead of
  // 'orphan: ' (trailing colon-space); the latter happens on a
  // freshly-cleared select where boundHeader transiently goes undefined.
  const label =
    source === 'csv'
      ? boundHeader ?? 'csv'
      : source === 'orphan'
        ? boundHeader ? `orphan: ${boundHeader}` : 'orphan'
        : 'default';

  return (
    <span
      title={tip}
      aria-label={label}
      className={`inline-flex items-center gap-1 ${colorCls}`}
    >
      <Icon className={`${iconSize} shrink-0`} />
      {showLabel && (
        <span className="font-mono text-[9px] normal-case tracking-normal">
          {label}
        </span>
      )}
    </span>
  );
}
